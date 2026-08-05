import { Inject, Injectable } from '@nestjs/common'
import type { User } from '@repo/shared'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { AuthenticatedUserNotFoundError } from '../../domain/user/user.errors'

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
 * AC-6), y compris dans la fenêtre qui sépare la résolution du guard de cette
 * lecture. D'où `AuthenticatedUserNotFoundError`, qui porte `unauthorized` et
 * produit donc un 401 — pas un 404, qui apprendrait au porteur d'un jeton périmé
 * que le compte a existé.
 *
 * Une version antérieure levait ici `UserNotFoundError` (404) tout en affirmant
 * en commentaire qu'une couche supérieure la traduisait en 401. Aucune ne le
 * faisait : c'est le mapping du filtre qui décide, et il n'a pas de branche
 * particulière pour ce cas. La traduction est donc désormais portée par le type
 * d'erreur lui-même, seul endroit où elle ne peut pas être oubliée.
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
      throw new AuthenticatedUserNotFoundError()
    }

    const token = await this.tokens.issue(user.id)
    return user.toUser(token)
  }
}
