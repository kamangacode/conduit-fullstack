import { Inject, Injectable } from '@nestjs/common'
import {
  ARTICLE_QUERY,
  type ArticleFilters,
  type ArticleQueryPort,
} from '../../domain/article/ports/article-query.port'
import type { ArticleListPage } from '../../domain/article/ports/article-view'
import type { ViewerId } from '../../domain/shared/viewer-id'

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
 * Ce qu'il fait, et que personne d'autre ne peut faire : **transmettre le
 * lecteur**. C'est peu, et c'est exactement ce que le contrat d'authentification
 * facultative exige (R-5).
 *
 * Il fabriquait autrefois aussi l'enveloppe `{ articles, articlesCount }`. Ce
 * n'était pas de la coordination mais du transport : `articlesCount` est un nom
 * de la spec RealWorld, pas un concept métier. L'enveloppe est produite depuis
 * l'ADR 031 par `interface/article/article.mapper.ts`, et le use-case renvoie la
 * page telle que le port la produit.
 *
 * La séparation `total` / `items.length` est préservée par `ArticleListPage` :
 * `total` est le total **avant** pagination, dont le front déduit son nombre de
 * pages (AC-3). Les deux coïncident tant qu'on teste avec moins d'articles
 * qu'une page, ce qui rend l'erreur invisible en développement.
 */
@Injectable()
export class ListArticlesUseCase {
  constructor(@Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort) {}

  execute(input: ListArticlesInput): Promise<ArticleListPage> {
    return this.query.list(input.filters, input.viewer)
  }
}
