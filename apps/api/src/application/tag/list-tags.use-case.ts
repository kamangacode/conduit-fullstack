import { Inject, Injectable } from '@nestjs/common'
import { TAG_QUERY, type TagName, type TagQueryPort } from './ports/tag-query.port'

/**
 * Lister les tags disponibles (REQ-TAG-002, `GET /api/tags`).
 *
 * Le use-case n'a **aucune** décision à prendre : pas d'authentification, pas de
 * filtre, pas de pagination, aucun ordre imposé par le contrat. Il transmet, et
 * c'est tout. Il enveloppait jusqu'à l'ADR 031 ; l'enveloppe `{ tags }` est
 * désormais fabriquée par le controller, seul endroit qui a le droit de
 * connaître la forme du fil.
 *
 * Ce qu'il ne fait surtout pas : renormaliser les tags. La normalisation est
 * faite à l'écriture, une seule fois, par les schémas du contrat
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

  execute(): Promise<readonly TagName[]> {
    return this.query.listUsed()
  }
}
