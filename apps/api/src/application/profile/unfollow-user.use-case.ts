import { Inject, Injectable } from '@nestjs/common'
import {
  FOLLOW_REPOSITORY,
  type FollowRepository,
} from '../../domain/profile/ports/follow-repository.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { type ProfileView, toProfileView } from './ports/profile-view'

export interface UnfollowUserInput {
  readonly username: string
  readonly followerId: string
}

/**
 * Ne plus suivre un utilisateur (REQ-PROFILE-003,
 * `DELETE /api/profiles/:username/follow`).
 *
 * Symétrique exact de `FollowUserUseCase`, y compris sur l'idempotence : retirer
 * une relation qui n'existe pas est un non-événement, pas un 404. Le seul 404 de
 * cet endpoint concerne une **cible inconnue**, ce qui est une situation
 * différente — un username qui ne désigne personne.
 *
 * Les deux use-cases restent deux fichiers plutôt qu'un seul paramétré par un
 * booléen : l'endpoint, la méthode HTTP et l'état résultant diffèrent, et un
 * paramètre `following: boolean` obligerait chaque lecteur à dérouler les deux
 * branches pour comprendre laquelle s'applique.
 */
@Injectable()
export class UnfollowUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FOLLOW_REPOSITORY) private readonly follows: FollowRepository
  ) {}

  async execute(input: UnfollowUserInput): Promise<ProfileView> {
    const target = await this.users.findByUsername(input.username)
    if (!target) {
      throw new UserNotFoundError()
    }

    await this.follows.unfollow(input.followerId, target.id)
    return toProfileView(target, false)
  }
}
