import { Inject, Injectable } from '@nestjs/common'
import {
  FOLLOW_REPOSITORY,
  type FollowRepository,
} from '../../domain/profile/ports/follow-repository.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { type ProfileView, toProfileView } from './ports/profile-view'

export interface FollowUserInput {
  /** Username de la cible, tel qu'il apparaît dans l'URL. */
  readonly username: string
  /** Identité du suiveur, dérivée du jeton vérifié (rule 19). */
  readonly followerId: string
}

/**
 * Suivre un utilisateur (REQ-PROFILE-003, `POST /api/profiles/:username/follow`).
 *
 * Le use-case ne demande pas d'abord si la relation existe : `follow` est
 * idempotent par contrat de port, propriété portée par la clé composite du schéma
 * Prisma. Un `isFollowing` préalable n'apporterait rien qu'une fenêtre de course.
 *
 * La réponse porte `following: true` sans relire la base : c'est l'état que
 * l'opération vient d'établir. Relire ne rendrait pas la réponse plus vraie, et
 * la rendrait sensible à un autre appel concurrent qui aurait retiré la relation
 * entre l'écriture et la lecture.
 *
 * L'auto-suivi n'est pas traité, faute de règle dans le contrat RealWorld
 * (REQ-PROFILE-003, section Contexte). Il est donc permis : inventer un refus
 * ajouterait un comportement propre à ce dépôt qu'un client écrit pour la spec ne
 * pourrait pas anticiper.
 */
@Injectable()
export class FollowUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FOLLOW_REPOSITORY) private readonly follows: FollowRepository
  ) {}

  async execute(input: FollowUserInput): Promise<ProfileView> {
    const target = await this.users.findByUsername(input.username)
    if (!target) {
      throw new UserNotFoundError()
    }

    await this.follows.follow(input.followerId, target.id)
    return toProfileView(target, true)
  }
}
