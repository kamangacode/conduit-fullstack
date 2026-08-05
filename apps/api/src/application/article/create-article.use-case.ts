import { Inject, Injectable } from '@nestjs/common'
import type { Article } from '@repo/shared'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import { ARTICLE_QUERY, type ArticleQueryPort } from '../../domain/article/ports/article-query.port'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'

export interface CreateArticleInput {
  readonly title: string
  readonly description: string
  readonly body: string
  readonly tagList: readonly string[]
  /** Identité de l'auteur, dérivée du jeton vérifié (rule 19), jamais du corps. */
  readonly authorId: string
}

/**
 * Publier un article (REQ-ARTICLE-003, `POST /api/articles`).
 *
 * Trois responsabilités, et pas une de plus :
 *
 * 1. **Dériver le slug** du titre (R-1). Le use-case ne demande pas si le slug
 *    est libre : la contrainte d'unicité de la base arbitre, et l'adapter suffixe
 *    au besoin (ADR 010). Un `findBySlug` préalable n'ajouterait qu'une fenêtre
 *    de course.
 * 2. **Dédoublonner les tags**. Les schémas de `@repo/shared` normalisent chaque
 *    tag isolément (trim) mais ne connaissent pas les autres éléments du tableau
 *    — la déduplication est donc bien du ressort de ce niveau (AC-5).
 * 3. **Relire** l'article créé par le port de lecture pour produire la réponse.
 *
 * Ce dernier point mérite sa justification : l'entité renvoyée par l'écriture
 * sait tout de l'article sauf ce que le contrat exige en plus — l'auteur en
 * `Profile`, `favorited`, `favoritesCount`. Les reconstituer ici dupliquerait la
 * projection du port de lecture, et les deux divergeraient au premier champ
 * ajouté. Un aller supplémentaire est le prix d'une réponse produite par un seul
 * endroit (ADR 011).
 */
@Injectable()
export class CreateArticleUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort
  ) {}

  async execute(input: CreateArticleInput): Promise<Article> {
    const created = await this.articles.create({
      slug: Slug.fromTitle(input.title),
      title: input.title,
      description: input.description,
      body: input.body,
      tagList: [...new Set(input.tagList)],
      authorId: input.authorId,
    })

    // Le slug retenu peut différer du candidat : c'est celui de l'entité créée
    // qu'on relit, jamais celui qu'on avait proposé.
    const article = await this.query.findBySlug(created.slug, input.authorId)
    if (!article) {
      // État impossible : l'article vient d'être écrit. On le signale plutôt que
      // de l'écarter par une assertion non-nulle (rule 17) — si la lecture et
      // l'écriture divergeaient un jour, l'erreur nommerait la cause.
      throw new ArticleNotFoundError()
    }
    return article
  }
}
