import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { FollowRepository } from '../../domain/profile/ports/follow-repository.port'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { PrismaService } from '../prisma/prisma.service'

/** Violation d'unicité — ici, la clé composite `(followerId, followingId)`. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002'

/** Violation de clé étrangère — l'un des deux comptes référencés n'existe plus. */
const FOREIGN_KEY_VIOLATION = 'P2003'

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
    try {
      await this.prisma.follow.upsert({
        where: { followerId_followingId: { followerId, followingId } },
        create: { followerId, followingId },
        update: {},
      })
    } catch (error) {
      // Un `upsert` n'est pas atomique : entre son `SELECT` et son `INSERT`, un
      // appel concurrent peut insérer la même ligne, et PostgreSQL rejette alors
      // le second sur la clé composite. L'état voulu — « je suis cette
      // personne » — est pourtant atteint, et l'endpoint est idempotent par
      // contrat : traiter ce cas comme un échec transformerait un double clic en
      // erreur (REQ-PROFILE-003 AC-2).
      if (isPrismaCode(error, UNIQUE_CONSTRAINT_VIOLATION)) {
        return
      }
      throw translateMissingReference(error)
    }
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } })
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

/**
 * Traduit une violation de clé étrangère en erreur de domaine.
 *
 * Elle survient quand l'un des deux comptes référencés disparaît pendant la
 * requête — le suiveur entre la résolution du guard et l'écriture, ou la cible
 * entre son `findByUsername` et l'écriture.
 *
 * `UserNotFoundError` (404) plutôt qu'un code d'authentification, parce que
 * PostgreSQL ne dit pas **lequel** des deux côtés manque : `meta.field_name`
 * porte le nom de la contrainte, pas l'identifiant fautif. Attribuer la
 * disparition au suiveur serait une supposition, et un 404 reste vrai dans les
 * deux cas — « l'un des comptes de cette opération n'existe pas » — sans rien
 * divulguer, puisque les profils sont déjà publics.
 *
 * Ce qui compte ici n'est pas le choix entre 404 et 401 sur une course
 * improbable, mais qu'aucune des deux situations ne ressorte en 500 au corps
 * illisible.
 */
function translateMissingReference(error: unknown): unknown {
  return isPrismaCode(error, FOREIGN_KEY_VIOLATION) ? new UserNotFoundError() : error
}
