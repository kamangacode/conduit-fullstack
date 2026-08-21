import { Inject, Injectable } from '@nestjs/common'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import { ARTICLE_QUERY, type ArticleQueryPort } from '../../domain/article/ports/article-query.port'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import type { ArticleView } from '../../domain/article/ports/article-view'
import {
  FAVORITE_REPOSITORY,
  type FavoriteRepository,
} from '../../domain/article/ports/favorite-repository.port'
import { Slug } from '../../domain/article/slug'

export interface UnfavoriteArticleInput {
  readonly slug: string
  /** Identité de l'appelant, dérivée du jeton vérifié (rule 19). */
  readonly userId: string
}

/**
 * Retirer un article de ses favoris (REQ-ARTICLE-009,
 * `DELETE /api/articles/:slug/favorite`).
 *
 * Symétrique exact de `FavoriteArticleUseCase`, y compris sur l'idempotence :
 * défavoriser ce qu'on n'a jamais favorisé est un succès, pas une erreur (AC-4).
 * Le compteur ne peut donc pas devenir négatif — non parce qu'on le borne, mais
 * parce qu'il n'est jamais décrémenté : il est recalculé depuis la table des
 * favoris à chaque lecture.
 *
 * Les deux use-cases restent séparés plutôt que fusionnés derrière un booléen.
 * Un paramètre `favorited: boolean` économiserait une classe et coûterait la
 * lisibilité de l'intention à l'appel — c'est aussi le parti pris retenu pour
 * suivre / ne plus suivre (REQ-PROFILE-003).
 */
@Injectable()
export class UnfavoriteArticleUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
    @Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort
  ) {}

  async execute(input: UnfavoriteArticleInput): Promise<ArticleView> {
    const slug = Slug.fromPersisted(input.slug)

    const target = await this.articles.findBySlug(slug)
    if (!target) {
      throw new ArticleNotFoundError()
    }

    await this.favorites.unfavorite(input.userId, target.id)

    const article = await this.query.findBySlug(slug, input.userId)
    if (!article) {
      throw new ArticleNotFoundError()
    }
    return article
  }
}
