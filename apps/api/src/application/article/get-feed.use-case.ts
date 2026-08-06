import { Inject, Injectable } from '@nestjs/common'
import type { ArticlesResponse } from '@repo/shared'
import {
  ARTICLE_QUERY,
  type ArticleQueryPort,
  type FeedPagination,
} from '../../domain/article/ports/article-query.port'

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
 * Le 401 attendu quand le jeton manque n'est pas levé ici : il l'est par le
 * guard, avant que ce use-case soit atteint. C'est la raison pour laquelle
 * `viewer` peut être un `string` non nullable — au moment où ce code s'exécute,
 * l'authentification est un fait acquis, pas une hypothèse.
 */
@Injectable()
export class GetFeedUseCase {
  constructor(@Inject(ARTICLE_QUERY) private readonly query: ArticleQueryPort) {}

  async execute(input: GetFeedInput): Promise<ArticlesResponse> {
    const page = await this.query.feed(input.pagination, input.viewer)

    return {
      articles: [...page.items],
      articlesCount: page.total,
    }
  }
}
