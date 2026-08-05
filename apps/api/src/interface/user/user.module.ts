import { Module } from '@nestjs/common'
import { GetCurrentUserUseCase } from '../../application/user/get-current-user.use-case'
import { LoginUserUseCase } from '../../application/user/login-user.use-case'
import { RegisterUserUseCase } from '../../application/user/register-user.use-case'
import { UpdateUserUseCase } from '../../application/user/update-user.use-case'
import { PASSWORD_HASHER } from '../../domain/user/ports/password-hasher.port'
import { TOKEN_SERVICE } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY } from '../../domain/user/ports/user-repository.port'
import { PrismaUserRepository } from '../../infrastructure/persistence/prisma-user.repository'
import { PrismaService } from '../../infrastructure/prisma/prisma.service'
import { Argon2PasswordHasher } from '../../infrastructure/security/argon2-password-hasher'
import { JoseTokenService } from '../../infrastructure/security/jose-token.service'
import { UserController, UsersController } from './user.controller'

/**
 * Câblage du contexte `user`.
 *
 * C'est **le seul endroit** où un port rencontre son adapter. Les use-cases
 * déclarent `@Inject(USER_REPOSITORY)` sans savoir que Prisma existe ; c'est ici
 * que le symbole devient une classe concrète. Déplacer ce câblage ailleurs — ou
 * l'éparpiller — ferait perdre la propriété qui justifie toute l'architecture :
 * un seul fichier à changer pour substituer une implémentation.
 *
 * Les trois ports sont **exportés** parce que `ProfileModule` et les guards en
 * ont besoin. Les redéclarer là-bas créerait deux instances du même adapter, donc
 * deux pools de connexions Prisma — un doublon silencieux, qui ne se manifeste
 * que sous charge.
 */
@Module({
  controllers: [UsersController, UserController],
  providers: [
    PrismaService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JoseTokenService },
    RegisterUserUseCase,
    LoginUserUseCase,
    GetCurrentUserUseCase,
    UpdateUserUseCase,
  ],
  exports: [PrismaService, USER_REPOSITORY, TOKEN_SERVICE],
})
export class UserModule {}
