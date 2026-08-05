import { Inject, Injectable } from '@nestjs/common'
import type { TagsResponse } from '@repo/shared'
import { TAG_QUERY, type TagQueryPort } from '../../domain/tag/ports/tag-query.port'

/**
 * Lister les tags disponibles (REQ-TAG-002, `GET /api/tags`).
 *
 * Le use-case n'a **aucune** décision à prendre : pas d'authentification, pas de
 * filtre, pas de pagination, aucun ordre imposé par le contrat. Il enveloppe, et
 * c'est tout.
 *
 * Ce qu'il ne fait surtout pas : renormaliser les tags. La normalisation est
 * faite à l'écriture, une seule fois, par les schémas de `@repo/shared`
 * (REQ-TAG-001). La refaire ici en créerait une seconde, et deux normalisations
 * finissent toujours par diverger — auquel cas le tag proposé par la sidebar ne
 * correspondrait plus à celui stocké sur les articles, et le filtre associé ne
 * ramènerait rien.
 *
 * La règle « un tag proposé ramène au moins un article » est portée par le nom
 * du port (`listUsed`) et résolue par sa requête, pas ici.
 */
@Injectable()
export class ListTagsUseCase {
  constructor(@Inject(TAG_QUERY) private readonly query: TagQueryPort) {}

  async execute(): Promise<TagsResponse> {
    const tags = await this.query.listUsed()
    return { tags: [...tags] }
  }
}
