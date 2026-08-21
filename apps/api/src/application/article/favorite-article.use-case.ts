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

export interface FavoriteArticleInput {
  readonly slug: string
  /** Identité de l'appelant, dérivée du jeton vérifié (rule 19). */
  readonly userId: string
}

/**
 * Favoriser un article (REQ-ARTICLE-009,
 * `POST /api/articles/:slug/favorite`).
 *
 * Le use-case ne demande pas d'abord si l'article est déjà favorisé : `favorite`
 * est idempotent par contrat de port, propriété portée par la clé composite du
 * schéma. Un contrôle préalable n'ajouterait qu'une fenêtre de course, pour un
 * cas — le double-clic — que le contrat traite comme un succès (AC-2).
 *
 * En revanche, l'article est **relu** après l'écriture, contrairement au suivi
 * qui renvoie `following: true` sans relire. La différence tient à ce que la
 * réponse doit porter : `favoritesCount` est un agrégat sur **tous** les
 * lecteurs, pas un état que cette opération connaîtrait. L'incrémenter
 * localement produirait un compteur qui dérive de la réalité dès qu'un autre
 * utilisateur favorise le même article (AC-5).
 */
@Injectable()
export class FavoriteArticleUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(FAVORITE_REPOSITORY) private readonly favorites: FavoriteRepository,
    @Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort
  ) {}

  async execute(input: FavoriteArticleInput): Promise<ArticleView> {
    const slug = Slug.fromPersisted(input.slug)

    // La résolution sert à obtenir l'identifiant interne — la table des favoris
    // référence l'article par son id, jamais par son slug, qui change au
    // renommage — et à produire le 404 attendu (AC-7).
    const target = await this.articles.findBySlug(slug)
    if (!target) {
      throw new ArticleNotFoundError()
    }

    await this.favorites.favorite(input.userId, target.id)

    const article = await this.query.findBySlug(slug, input.userId)
    if (!article) {
      throw new ArticleNotFoundError()
    }
    return article
  }
}
