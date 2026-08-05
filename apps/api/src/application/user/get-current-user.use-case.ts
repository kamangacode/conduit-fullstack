import { Inject, Injectable } from '@nestjs/common'
import type { User } from '@repo/shared'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { UserNotFoundError } from '../../domain/user/user.errors'

export interface GetCurrentUserInput {
  /** Identité **dérivée du jeton vérifié**, jamais lue dans la requête (rule 19). */
  readonly userId: string
}

/**
 * Lecture du compte courant (REQ-USER-004, `GET /api/user`).
 *
 * L'identifiant vient du guard, donc d'un jeton dont la signature a été vérifiée.
 * Le use-case n'a pas à s'en défier — mais il doit encore le **résoudre** : un
 * jeton parfaitement signé peut désigner un compte supprimé depuis (REQ-AUTH-001
 * AC-6). D'où la levée de `UserNotFoundError`, que la couche interface traduit en
 * 401 plutôt qu'en 404 : le porteur d'un jeton périmé n'a pas à apprendre si le
 * compte a existé.
 *
 * Un jeton **neuf** est émis à chaque appel plutôt que d'écho du jeton reçu. Le
 * contrat impose seulement qu'une réponse `User` en porte un (PRD §9), et
 * réémettre évite de faire remonter la chaîne de caractères brute du jeton depuis
 * le transport jusqu'ici — ce qui obligerait à la manipuler dans trois couches
 * pour ne rien en faire. Conséquence assumée : la validité glisse à chaque appel.
 */
@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService
  ) {}

  async execute(input: GetCurrentUserInput): Promise<User> {
    const user = await this.users.findById(input.userId)
    if (!user) {
      throw new UserNotFoundError()
    }

    const token = await this.tokens.issue(user.id)
    return user.toUser(token)
  }
}
