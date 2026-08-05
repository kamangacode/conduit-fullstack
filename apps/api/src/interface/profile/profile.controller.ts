import { Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common'
import type { ProfileResponse } from '@repo/shared'
import { FollowUserUseCase } from '../../application/profile/follow-user.use-case'
import { GetProfileUseCase } from '../../application/profile/get-profile.use-case'
import { UnfollowUserUseCase } from '../../application/profile/unfollow-user.use-case'
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard'
import { CurrentUserId, OptionalCurrentUserId } from '../auth/current-user.decorator'

/**
 * Endpoints de profil (PRD §7.2).
 *
 * Trois routes, **deux régimes d'authentification** : la consultation est
 * optionnelle, le suivi et le retrait l'exigent. Les guards sont posés par
 * méthode plutôt que sur la classe, précisément parce qu'ils diffèrent — un guard
 * de classe assorti d'exceptions est la configuration où l'on finit par protéger
 * ce qui devrait être ouvert, ou l'inverse.
 */
@Controller('profiles')
export class ProfileController {
  constructor(
    @Inject(GetProfileUseCase) private readonly getProfile: GetProfileUseCase,
    @Inject(FollowUserUseCase) private readonly followUser: FollowUserUseCase,
    @Inject(UnfollowUserUseCase) private readonly unfollowUser: UnfollowUserUseCase
  ) {}

  /**
   * Consultation. Authentification optionnelle : un anonyme obtient le profil
   * avec `following: false` (R-5), jamais un 401.
   */
  @Get(':username')
  @UseGuards(OptionalAuthGuard)
  async show(
    @Param('username') username: string,
    @OptionalCurrentUserId() viewerId: string | null
  ): Promise<ProfileResponse> {
    const profile = await this.getProfile.execute({ username, viewerId })
    return { profile }
  }

  /** Suivre. `@HttpCode(200)` : le contrat attend 200, pas le 201 par défaut du POST. */
  @Post(':username/follow')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async follow(
    @Param('username') username: string,
    @CurrentUserId() followerId: string
  ): Promise<ProfileResponse> {
    const profile = await this.followUser.execute({ username, followerId })
    return { profile }
  }

  /**
   * Ne plus suivre. `@HttpCode(200)` là encore : NestJS répondrait 200 sur DELETE
   * par défaut, mais l'expliciter documente que le contrat attend un corps —
   * un DELETE qui renvoie une représentation n'est pas l'usage le plus courant.
   */
  @Delete(':username/follow')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async unfollow(
    @Param('username') username: string,
    @CurrentUserId() followerId: string
  ): Promise<ProfileResponse> {
    const profile = await this.unfollowUser.execute({ username, followerId })
    return { profile }
  }
}
