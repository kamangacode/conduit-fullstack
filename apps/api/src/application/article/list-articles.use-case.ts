import { Inject, Injectable } from '@nestjs/common'
import type { ArticlesResponse } from '@repo/shared'
import {
  ARTICLE_QUERY,
  type ArticleFilters,
  type ArticleQueryPort,
  type ViewerId,
} from '../../domain/article/ports/article-query.port'

export interface ListArticlesInput {
  readonly filters: ArticleFilters
  /** Lecteur, ou `null` si anonyme (R-5). */
  readonly viewer: ViewerId
}

/**
 * Lister les articles publiés (REQ-ARTICLE-007, `GET /api/articles`).
 *
 * Ce use-case est le plus mince du dépôt, et sa minceur est un **symptôme
 * correct** : le tri (R-2), les filtres (R-3), l'omission du `body` (R-7) et la
 * relativité au lecteur (R-5) sont toutes des propriétés de la requête, pas de
 * la coordination. Les remonter ici les ferait exécuter en mémoire sur un jeu
 * déjà paginé — c'est-à-dire faussement.
 *
 * Ce qu'il fait, et que personne d'autre ne peut faire : transmettre le lecteur,
 * et transformer la page du port en **enveloppe du contrat**. La séparation
 * `total` / `items.length` est préservée telle quelle : `articlesCount` est le
 * total avant pagination, dont le front déduit son nombre de pages
 * (AC-3). Les deux coïncident tant qu'on teste avec moins d'articles qu'une
 * page, ce qui rend l'erreur invisible en développement.
 */
@Injectable()
export class ListArticlesUseCase {
  constructor(@Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort) {}

  async execute(input: ListArticlesInput): Promise<ArticlesResponse> {
    const page = await this.query.list(input.filters, input.viewer)

    return {
      articles: [...page.items],
      articlesCount: page.total,
    }
  }
}
