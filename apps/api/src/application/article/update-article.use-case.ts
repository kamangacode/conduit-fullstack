import { Inject, Injectable } from '@nestjs/common'
import type { Article } from '@repo/shared'
import type { ArticleChanges } from '../../domain/article/article'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import { ARTICLE_QUERY, type ArticleQueryPort } from '../../domain/article/ports/article-query.port'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'

export interface UpdateArticleInput {
  /** Slug tel qu'il apparaît dans l'URL. */
  readonly slug: string
  /** Identité de l'appelant, dérivée du jeton vérifié (rule 19). */
  readonly userId: string
  readonly changes: ArticleChanges
}

/**
 * Modifier son propre article (REQ-ARTICLE-005, `PUT /api/articles/:slug`).
 *
 * L'ordre des trois contrôles est la substance de ce use-case :
 *
 * 1. **L'article existe-t-il ?** Sinon 404 (AC-5). Poser cette question en
 *    premier évite un 403 sur une ressource absente, qui affirmerait son
 *    existence.
 * 2. **Appartient-il à l'appelant ?** Sinon 403 (AC-4) — et non 404, parce que
 *    les articles sont publiquement lisibles, donc leur existence n'est pas une
 *    information protégée (ADR 008).
 * 3. **Que devient le slug ?** L'entité tranche : il ne suit le titre que si le
 *    titre change réellement (AC-2 et AC-3).
 *
 * La garde d'appartenance est doublée par le filtrage `(id, authorId)` dans la
 * requête du repository (rule 19). Ce n'est pas une redondance inutile : la
 * garde du domaine nomme l'erreur métier, le filtre SQL ferme la fenêtre entre
 * la lecture et l'écriture. Retirer l'un ou l'autre dégrade une propriété
 * différente.
 */
@Injectable()
export class UpdateArticleUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort
  ) {}

  async execute(input: UpdateArticleInput): Promise<Article> {
    const current = await this.articles.findBySlug(Slug.fromPersisted(input.slug))
    if (!current) {
      throw new ArticleNotFoundError()
    }
    current.assertEditableBy(input.userId)

    const updated = await this.articles.update(current.id, input.userId, {
      ...input.changes,
      ...(input.changes.tagList ? { tagList: [...new Set(input.changes.tagList)] } : {}),
    })

    const article = await this.query.findBySlug(updated.slug, input.userId)
    if (!article) {
      throw new ArticleNotFoundError()
    }
    return article
  }
}
