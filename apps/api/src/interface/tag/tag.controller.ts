import { Controller, Get, Inject } from '@nestjs/common'
import type { TagsResponse } from '@repo/shared'
import { ListTagsUseCase } from '../../application/tag/list-tags.use-case'

/**
 * Endpoint des tags (PRD §7.5).
 *
 * Une seule route, sans guard : `GET /api/tags` est public et le reste même
 * pour un appelant authentifié — rien dans cette réponse ne dépend du lecteur,
 * contrairement à tout le reste de la slice. C'est le seul endpoint de F3 dans
 * ce cas, et c'est pourquoi il n'a pas même d'`OptionalAuthGuard` : poser un
 * guard dont la valeur ne sert à personne laisserait croire l'inverse.
 */
@Controller('tags')
export class TagController {
  constructor(@Inject(ListTagsUseCase) private readonly listTags: ListTagsUseCase) {}

  @Get()
  async list(): Promise<TagsResponse> {
    // L'enveloppe est fabriquée ici, et sans mapper dédié : il n'y a rien à
    // convertir, seulement une clé et un tableau. Écrire un `tag.mapper.ts`
    // pour ça serait de la cérémonie — les mappers des autres contextes
    // existent parce qu'ils portent une conversion réelle (dates, projections).
    const tags = await this.listTags.execute()
    return { tags: [...tags] }
  }
}
