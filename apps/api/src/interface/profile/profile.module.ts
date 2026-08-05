import { Module } from '@nestjs/common'
import { FollowUserUseCase } from '../../application/profile/follow-user.use-case'
import { GetProfileUseCase } from '../../application/profile/get-profile.use-case'
import { UnfollowUserUseCase } from '../../application/profile/unfollow-user.use-case'
import { FOLLOW_REPOSITORY } from '../../domain/profile/ports/follow-repository.port'
import { PrismaFollowRepository } from '../../infrastructure/persistence/prisma-follow.repository'
import { UserModule } from '../user/user.module'
import { ProfileController } from './profile.controller'

/**
 * Câblage du contexte `profile`.
 *
 * `UserModule` est importé plutôt que ses providers redéclarés : les use-cases de
 * profil ont besoin de `USER_REPOSITORY` (résoudre la cible par son username) et
 * les guards de `TOKEN_SERVICE`. Redéclarer aurait produit une seconde instance
 * de `PrismaService`, donc un second pool de connexions — un doublon qui ne se
 * voit pas en test et se paie en production.
 *
 * C'est aussi la couture DI la plus fragile du dépôt (rule 12) : le module
 * fonctionne tant que `UserModule` **exporte** ces tokens. Un oubli d'export ne
 * casse pas la compilation, il casse le boot — d'où la couverture dans
 * `app-module.boot.spec.ts`, seul niveau de test qui voit le graphe réel.
 */
@Module({
  imports: [UserModule],
  controllers: [ProfileController],
  providers: [
    { provide: FOLLOW_REPOSITORY, useClass: PrismaFollowRepository },
    GetProfileUseCase,
    FollowUserUseCase,
    UnfollowUserUseCase,
  ],
})
export class ProfileModule {}
