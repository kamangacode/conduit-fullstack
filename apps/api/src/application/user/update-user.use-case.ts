import { Inject, Injectable } from '@nestjs/common'
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/user/ports/password-hasher.port'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import type { UserChanges } from '../../domain/user/user'
import { type AccountView, toAccountView } from './ports/account-view'

/**
 * Champs modifiables. Chacun est optionnel, et `bio`/`image` acceptent `null` :
 * le contrat distingue « ne pas toucher » (clé absente) de « effacer » (`null`),
 * et cette signature est le premier endroit où la distinction doit survivre.
 *
 * Le `| undefined` explicite est requis par `exactOptionalPropertyTypes`, et il
 * dit quelque chose de vrai : à cette frontière, **clé absente et clé à
 * `undefined` valent la même chose** — ne pas toucher. C'est nécessaire parce
 * qu'un DTO validé par Zod se transmet naturellement par étalement, ce qui
 * matérialise les clés absentes en `undefined`. La distinction qui compte, elle,
 * est ailleurs : entre `undefined` (ne pas toucher) et `null` (effacer), et c'est
 * `execute` qui la fait valoir en testant `!== undefined`.
 */
export interface UpdateUserInput {
  readonly userId: string
  readonly email?: string | undefined
  readonly username?: string | undefined
  readonly password?: string | undefined
  readonly bio?: string | null | undefined
  readonly image?: string | null | undefined
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

  async execute(input: UpdateUserInput): Promise<AccountView> {
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
    return toAccountView(user, token)
  }
}
