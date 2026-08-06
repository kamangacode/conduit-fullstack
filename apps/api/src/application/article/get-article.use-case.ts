import { Inject, Injectable } from '@nestjs/common'
import type { Article } from '@repo/shared'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import {
  ARTICLE_QUERY,
  type ArticleQueryPort,
  type ViewerId,
} from '../../domain/article/ports/article-query.port'
import { Slug } from '../../domain/article/slug'

export interface GetArticleInput {
  readonly slug: string
  /**
   * Lecteur, ou `null` s'il est anonyme. Obligatoire dans la signature : sur un
   * endpoint à authentification facultative, omettre le lecteur produit une
   * réponse valide où `favorited` et `following` valent `false` pour tout le
   * monde. Le rendre explicite force à décider (R-5).
   */
  readonly viewer: ViewerId
}

/**
 * Consulter un article (REQ-ARTICLE-004, `GET /api/articles/:slug`).
 *
 * Le use-case est mince, et c'est correct : il traduit une absence en erreur
 * métier et transmet le lecteur. La projection — auteur en `Profile`,
 * `favorited`, `favoritesCount` — appartient au port de lecture, qui la résout
 * en une requête (ADR 011). Un use-case qui la recomposerait ici dupliquerait
 * celle des listes, et les deux divergeraient.
 *
 * Le slug vient de l'URL : on le reconstitue **tel quel** (`fromPersisted`) et
 * non par slugification. Re-slugifier une valeur déjà slugifiée serait au mieux
 * une opération neutre, au pire une transformation qui empêcherait de retrouver
 * un article dont le slug porte un suffixe de collision.
 */
@Injectable()
export class GetArticleUseCase {
  constructor(@Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort) {}

  async execute(input: GetArticleInput): Promise<Article> {
    const article = await this.query.findBySlug(Slug.fromPersisted(input.slug), input.viewer)
    if (!article) {
      throw new ArticleNotFoundError()
    }
    return article
  }
}
