import { Inject, Injectable } from '@nestjs/common'
import type { User } from '@repo/shared'
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/user/ports/password-hasher.port'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import type { UserChanges } from '../../domain/user/user'

/**
 * Champs modifiables. Chacun est optionnel, et `bio`/`image` acceptent `null` :
 * le contrat distingue « ne pas toucher » (clé absente) de « effacer » (`null`),
 * et cette signature est le premier endroit où la distinction doit survivre.
 */
export interface UpdateUserInput {
  readonly userId: string
  readonly email?: string
  readonly username?: string
  readonly password?: string
  readonly bio?: string | null
  readonly image?: string | null
}

/**
 * Mise à jour du compte courant (REQ-USER-004, `PUT /api/user`).
 *
 * Deux points méritent l'attention :
 *
 * **La construction des changements se fait par étalement conditionnel.** Écrire
 * `{ email: input.email, bio: input.bio, … }` poserait les clés absentes à
 * `undefined`, et le dépôt ne pourrait plus distinguer « non fourni » de
 * « fourni vide ». Les clés ne sont donc posées que si elles sont présentes —
 * `exactOptionalPropertyTypes` (activé dans le tsconfig) fait respecter cette
 * discipline à la compilation.
 *
 * **Aucune vérification d'unicité préalable**, pour la même raison qu'à
 * l'inscription : c'est la contrainte SQL qui arbitre (ADR 009). Reprendre son
 * propre email n'est pas un conflit, et ça n'exige aucun code particulier ici —
 * un `UPDATE` de la même ligne vers la même valeur ne viole aucune contrainte
 * d'unicité. Le cas est couvert par un test parce qu'il est facile de le casser
 * en ajoutant un `findByEmail` « défensif » qui, lui, trouverait l'appelant.
 */
@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService
  ) {}

  async execute(input: UpdateUserInput): Promise<User> {
    const changes: UserChanges = {
      ...(input.email !== undefined && { email: input.email }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.password !== undefined && {
        passwordHash: await this.passwords.hash(input.password),
      }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.image !== undefined && { image: input.image }),
    }

    const user = await this.users.update(input.userId, changes)
    const token = await this.tokens.issue(user.id)
    return user.toUser(token)
  }
}
