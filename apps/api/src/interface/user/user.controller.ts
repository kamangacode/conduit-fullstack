import { Body, Controller, Get, HttpCode, Inject, Post, Put, UseGuards } from '@nestjs/common'
import {
  type LoginDto,
  loginDtoSchema,
  type RegisterDto,
  registerDtoSchema,
  type UpdateUserDto,
  type UserResponse,
  updateUserDtoSchema,
} from '@repo/shared'
import { GetCurrentUserUseCase } from '../../application/user/get-current-user.use-case'
import { LoginUserUseCase } from '../../application/user/login-user.use-case'
import { RegisterUserUseCase } from '../../application/user/register-user.use-case'
import { UpdateUserUseCase } from '../../application/user/update-user.use-case'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserId } from '../auth/current-user.decorator'
import { zodEnvelope } from '../pipes/zod-validation.pipe'

/**
 * Endpoints d'authentification et de compte (PRD §7.1).
 *
 * Le contrôleur ne contient **aucune logique métier** (rule 12) : il valide,
 * mappe vers l'input du use-case, et enveloppe la réponse. Les erreurs de domaine
 * ne sont pas attrapées ici — `DomainExceptionFilter` les traduit, ce qui évite un
 * `try/catch` par méthode.
 *
 * Noter que les deux chemins sont montés sur des contrôleurs de préfixe
 * différent : `/users` (pluriel) pour l'inscription et la connexion, `/user`
 * (singulier) pour le compte courant. C'est le contrat, pas une coquille.
 */
@Controller('users')
export class UsersController {
  constructor(
    @Inject(RegisterUserUseCase) private readonly registerUser: RegisterUserUseCase,
    @Inject(LoginUserUseCase) private readonly loginUser: LoginUserUseCase
  ) {}

  /** Inscription. 201 par `openapi.yml` — c'est aussi le défaut de NestJS sur POST. */
  @Post()
  async register(
    @Body(zodEnvelope('user', registerDtoSchema)) dto: RegisterDto
  ): Promise<UserResponse> {
    const user = await this.registerUser.execute(dto)
    return { user }
  }

  /**
   * Connexion. `@HttpCode(200)` explicite : NestJS répondrait 201 sur un POST,
   * là où le contrat attend 200.
   */
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodEnvelope('user', loginDtoSchema)) dto: LoginDto): Promise<UserResponse> {
    const user = await this.loginUser.execute(dto)
    return { user }
  }
}

/**
 * Compte courant (`/api/user`, singulier). Les deux routes sont protégées.
 */
@Controller('user')
@UseGuards(AuthGuard)
export class UserController {
  constructor(
    @Inject(GetCurrentUserUseCase) private readonly getCurrentUser: GetCurrentUserUseCase,
    @Inject(UpdateUserUseCase) private readonly updateUser: UpdateUserUseCase
  ) {}

  @Get()
  async current(@CurrentUserId() userId: string): Promise<UserResponse> {
    const user = await this.getCurrentUser.execute({ userId })
    return { user }
  }

  /**
   * Mise à jour partielle.
   *
   * `userId` vient du jeton vérifié et est posé **après** le DTO dans l'objet
   * d'input : même si le corps portait un `userId`, le schéma Zod l'aurait déjà
   * rejeté, et cet ordre garantit qu'aucune valeur du client ne peut l'emporter
   * sur l'identité serveur (rule 19).
   */
  @Put()
  async update(
    @CurrentUserId() userId: string,
    @Body(zodEnvelope('user', updateUserDtoSchema)) dto: UpdateUserDto
  ): Promise<UserResponse> {
    const user = await this.updateUser.execute({ ...dto, userId })
    return { user }
  }
}
