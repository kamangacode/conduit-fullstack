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
    // Mapping champ par champ, et non `execute(dto)`. Le contrôle de propriétés
    // excédentaires de TypeScript ne s'applique pas au passage d'une variable :
    // transmettre l'objet tel quel ferait entrer dans le use-case, au runtime et
    // sans erreur de compilation, tout champ ajouté un jour au schéma HTTP. La
    // frontière « input owned par le use-case » (rule 12) n'existe que si elle
    // est écrite ici.
    const user = await this.registerUser.execute({
      username: dto.username,
      email: dto.email,
      password: dto.password,
    })
    return { user }
  }

  /**
   * Connexion. `@HttpCode(200)` explicite : NestJS répondrait 201 sur un POST,
   * là où le contrat attend 200.
   */
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodEnvelope('user', loginDtoSchema)) dto: LoginDto): Promise<UserResponse> {
    const user = await this.loginUser.execute({ email: dto.email, password: dto.password })
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
   * Mapping explicite plutôt qu'un `{ ...dto, userId }` : outre la frontière
   * d'input (voir `register`), l'étalement rendait l'identité serveur dépendante
   * de l'ordre des clés — `userId` n'était protégé que parce qu'il était écrit en
   * dernier. Ici, `userId` vient du jeton vérifié et aucune valeur du corps ne
   * peut l'atteindre, quel que soit l'ordre (rule 19).
   *
   * Les champs optionnels sont recopiés tels quels, `undefined` compris : c'est
   * ce qui préserve la distinction entre « absent » (ne pas toucher) et `null`
   * (effacer), que le use-case tranche ensuite.
   */
  @Put()
  async update(
    @CurrentUserId() userId: string,
    @Body(zodEnvelope('user', updateUserDtoSchema)) dto: UpdateUserDto
  ): Promise<UserResponse> {
    const user = await this.updateUser.execute({
      userId,
      email: dto.email,
      username: dto.username,
      password: dto.password,
      bio: dto.bio,
      image: dto.image,
    })
    return { user }
  }
}
