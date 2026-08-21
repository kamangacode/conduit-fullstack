import { Inject, Injectable } from '@nestjs/common'
import {
  FOLLOW_REPOSITORY,
  type FollowRepository,
} from '../../domain/profile/ports/follow-repository.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { type ProfileView, toProfileView } from './profile-view'

export interface GetProfileInput {
  readonly username: string
  /**
   * Identité de l'appelant, ou `null` s'il est anonyme.
   *
   * `null` explicite plutôt qu'optionnel : sur une route à authentification
   * optionnelle, l'absence d'appelant est un cas nominal qui change la réponse
   * (R-5). Un champ qu'on peut oublier de passer produirait silencieusement un
   * `following` à `false` pour un utilisateur pourtant authentifié.
   */
  readonly viewerId: string | null
}

/**
 * Consultation d'un profil public (REQ-PROFILE-002).
 *
 * Le dépôt de suivi n'est **pas** interrogé quand l'appelant est anonyme : R-5
 * impose `following: false`, et la réponse est connue sans requête. Ce n'est pas
 * qu'une optimisation — c'est ce qui garantit qu'aucune requête ne part avec un
 * identifiant d'appelant vide, cas où une implémentation trop permissive pourrait
 * ramener n'importe quelle relation.
 */
@Injectable()
export class GetProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FOLLOW_REPOSITORY) private readonly follows: FollowRepository
  ) {}

  async execute(input: GetProfileInput): Promise<ProfileView> {
    const user = await this.users.findByUsername(input.username)
    if (!user) {
      throw new UserNotFoundError()
    }

    const following =
      input.viewerId === null ? false : await this.follows.isFollowing(input.viewerId, user.id)

    return toProfileView(user, following)
  }
}
