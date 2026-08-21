import { Inject, Injectable } from '@nestjs/common'
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/user/ports/password-hasher.port'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { type AccountView, toAccountView } from './account-view'

/**
 * Input **owned par le use-case** (rule 12) : il ne réutilise pas le DTO de la
 * couche `interface`. Structurellement identique aujourd'hui, il le restera par
 * décision et non par accident — un champ ajouté au DTO HTTP (un jeton de
 * captcha, un consentement) n'entrerait pas ici sans qu'on le veuille.
 */
export interface RegisterUserInput {
  readonly username: string
  readonly email: string
  readonly password: string
}

/**
 * Inscription d'un nouveau compte (REQ-USER-002).
 *
 * Le use-case ne connaît ni argon2 ni jose : il dépend de `PasswordHasher` et de
 * `TokenService` (ADR 007). C'est ce qui rend ce fichier testable sans
 * cryptographie et lisible sans connaître l'algorithme retenu.
 *
 * **Aucune vérification d'unicité préalable.** L'enchaînement naturel serait
 * `findByEmail` puis `create`, et il serait faux : entre les deux, un appel
 * concurrent peut insérer le même email. C'est le dépôt qui arbitre, sur la
 * contrainte `@unique` de PostgreSQL, et qui traduit la violation en erreur de
 * domaine (ADR 009). Le chemin de conflit n'apparaît donc pas dans ce fichier —
 * il remonte par exception.
 */
@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService
  ) {}

  async execute(input: RegisterUserInput): Promise<AccountView> {
    // Le mot de passe en clair ne dépasse pas cette ligne : ce qui entre dans le
    // dépôt est déjà un condensat (R-9).
    const passwordHash = await this.passwords.hash(input.password)

    const user = await this.users.create({
      email: input.email,
      username: input.username,
      passwordHash,
    })

    const token = await this.tokens.issue(user.id)
    return toAccountView(user, token)
  }
}
