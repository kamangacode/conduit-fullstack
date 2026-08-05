import { Inject, Injectable } from '@nestjs/common'
import type { User } from '@repo/shared'
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/user/ports/password-hasher.port'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { InvalidCredentialsError } from '../../domain/user/user.errors'

/**
 * Condensat servant de leurre quand l'email est inconnu.
 *
 * Sa valeur n'a aucune importance — il ne correspond à aucun mot de passe. Ce qui
 * compte est qu'il soit **structurellement valide**, pour que l'adapter argon2
 * fasse réellement le travail de vérification au lieu de rejeter la chaîne
 * immédiatement. Un leurre malformé rendrait la parade inopérante en rétablissant
 * l'écart de temps qu'elle est censée supprimer.
 *
 * Les paramètres sont ceux de l'ADR 007, pour que le coût du calcul soit celui
 * d'une vérification réelle.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$DkZMIVITZtdRk3h3sXUkxg$bb4EJMiXYR6TkvCnG6ARH9M1oVXgorBrbTJcSLkdtfw'

export interface LoginUserInput {
  readonly email: string
  readonly password: string
}

/**
 * Connexion par email et mot de passe (REQ-USER-003).
 *
 * Tout l'intérêt de ce use-case est dans son chemin de refus, et il porte deux
 * protections distinctes contre l'énumération de comptes :
 *
 * 1. **Une seule erreur pour deux causes.** Email inconnu et mot de passe erroné
 *    lèvent la même `InvalidCredentialsError`, donc produisent la même réponse.
 *    Lever une `UserNotFoundError` quand l'email est inconnu — l'écriture la plus
 *    naturelle — ferait de l'API un oracle répondant à « ce compte existe-t-il ? »
 *    sans authentification.
 *
 * 2. **Un temps de réponse comparable.** Sortir dès que l'email est inconnu
 *    répondrait sans hacher, donc bien plus vite qu'un mot de passe erroné, qui
 *    coûte une vérification argon2 de plusieurs dizaines de millisecondes. L'écart
 *    est mesurable à distance et rétablit exactement l'oracle que le point 1
 *    ferme. On vérifie donc le mot de passe contre un condensat leurre.
 *
 * La seconde protection est celle qu'on oublie, parce que rien dans la réponse ne
 * la trahit. `login-user.use-case.spec.ts` l'asserte via le compteur de la
 * doublure de hachage.
 */
@Injectable()
export class LoginUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService
  ) {}

  async execute(input: LoginUserInput): Promise<User> {
    const user = await this.users.findByEmail(input.email)

    const matches = await this.passwords.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password
    )

    // `user === null` plutôt que `!user` : la comparaison explicite dit que le
    // seul cas d'absence est le compte introuvable, et évite la double négation
    // que biome refuse à juste titre comme inutilement dense.
    if (user === null || !matches) {
      throw new InvalidCredentialsError()
    }

    const token = await this.tokens.issue(user.id)
    return user.toUser(token)
  }
}
