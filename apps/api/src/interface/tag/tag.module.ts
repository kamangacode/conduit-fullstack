import { Module } from '@nestjs/common'
import { ListTagsUseCase } from '../../application/tag/list-tags.use-case'
import { TAG_QUERY } from '../../application/tag/ports/tag-query.port'
import { PrismaTagQuery } from '../../infrastructure/persistence/prisma-tag.query'
import { UserModule } from '../user/user.module'
import { TagController } from './tag.controller'

/**
 * Câblage du contexte `tag`.
 *
 * `UserModule` est importé pour la seule `PrismaService` — ce module n'a ni
 * guard ni besoin d'identité. L'import paraît disproportionné et reste le bon
 * choix : la solution alternative, redéclarer `PrismaService` ici, ouvrirait un
 * second pool de connexions pour une unique requête de lecture.
 *
 * Le jour où le nombre de modules rendrait cette dépendance transverse gênante,
 * la réponse serait un `PersistenceModule` global exportant `PrismaService`, pas
 * une duplication.
 */
@Module({
  imports: [UserModule],
  controllers: [TagController],
  providers: [{ provide: TAG_QUERY, useClass: PrismaTagQuery }, ListTagsUseCase],
})
export class TagModule {}
