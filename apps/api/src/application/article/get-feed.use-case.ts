import { Inject, Injectable } from '@nestjs/common'
import {
  ARTICLE_QUERY,
  type ArticleQueryPort,
  type FeedPagination,
} from './ports/article-query.port'
import type { ArticleListPage } from './ports/article-view'

export interface GetFeedInput {
  readonly pagination: FeedPagination
  /**
   * Lecteur, **obligatoire** : le flux est défini par ses abonnements (R-4).
   * Le type l'exige, à la place d'un commentaire — un `ViewerId` nullable ici
   * autoriserait un flux anonyme, qui n'a pas de sens définissable.
   */
  readonly viewer: string
}

/**
 * Consulter son flux personnel (REQ-ARTICLE-008,
 * `GET /api/articles/feed`).
 *
 * Identique au listing global sur la forme de réponse, et différent sur deux
 * points qui tiennent tous les deux dans la signature : aucun filtre n'est
 * accepté, et le lecteur n'est pas facultatif.
 *
 * Comme le listing, il ne fabrique plus l'enveloppe `{ articles, articlesCount }`
 * depuis l'ADR 031 : elle est produite par `interface/article/article.mapper.ts`,
 * le même mapper pour les deux routes. C'est ce qui garantit que les deux formes
 * de réponse restent identiques sans que rien ne le rappelle en commentaire.
 *
 * Le 401 attendu quand le jeton manque n'est pas levé ici : il l'est par le
 * guard, avant que ce use-case soit atteint. C'est la raison pour laquelle
 * `viewer` peut être un `string` non nullable — au moment où ce code s'exécute,
 * l'authentification est un fait acquis, pas une hypothèse.
 */
@Injectable()
export class GetFeedUseCase {
  constructor(@Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort) {}

  execute(input: GetFeedInput): Promise<ArticleListPage> {
    return this.query.feed(input.pagination, input.viewer)
  }
}
