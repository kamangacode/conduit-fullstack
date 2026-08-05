import { Injectable } from '@nestjs/common'
import type { FollowRepository } from '../../domain/profile/ports/follow-repository.port'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Adapter Prisma du port `FollowRepository`.
 *
 * L'idempotence promise par le port est obtenue **sans branche conditionnelle**,
 * en s'appuyant sur la clé composite `(followerId, followingId)` :
 *
 * - `follow` utilise `upsert` avec un `update` vide. Suivre quelqu'un qu'on suit
 *   déjà retombe sur la branche `update`, qui ne modifie rien. L'alternative —
 *   « lire puis créer si absent » — laisserait une fenêtre de course pendant
 *   laquelle un second appel peut insérer la même ligne, et la contrainte
 *   d'unicité ferait alors échouer une opération que le contrat veut idempotente.
 * - `unfollow` utilise `deleteMany` et non `delete`. `delete` lève quand la ligne
 *   n'existe pas, ce qui transformerait un retrait sans effet en erreur ;
 *   `deleteMany` supprime zéro ligne et rend la main. Le contrat ne prévoit
 *   aucun code d'erreur pour ce cas.
 *
 * Aucune requête brute : tout passe par le query builder Prisma, donc paramétré
 * (rule 19).
 */
@Injectable()
export class PrismaFollowRepository implements FollowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const link = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      // On ne veut savoir que si la ligne existe : ne ramener que la clé évite
      // de transporter des colonnes dont personne ne fera rien.
      select: { followerId: true },
    })
    return link !== null
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    })
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } })
  }
}
