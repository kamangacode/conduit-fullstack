import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  IdempotencyIdentity,
  IdempotencyStore,
  ReservationOutcome,
} from '../../interface/idempotency/idempotency-store.port'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Registre des clés d'idempotence sur PostgreSQL (REQ-IDEM-001, ADR 027).
 *
 * Toute la propriété tient dans la contrainte `@@unique([userId, endpoint, key])`
 * et dans l'ordre des opérations : on **écrit d'abord**, on exécute ensuite. Le
 * chemin inverse — lire puis écrire — laisserait entre les deux exactement la
 * fenêtre que le double-clic exploite, et cette fenêtre ne se voit qu'en charge.
 */

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002'

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_CONSTRAINT_VIOLATION

/** Coordonnées de la contrainte composite, écrites une fois. */
const locate = ({ userId, endpoint, key }: IdempotencyIdentity) => ({
  userId_endpoint_key: { userId, endpoint, key },
})

@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(identity: IdempotencyIdentity): Promise<ReservationOutcome> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId: identity.userId,
          endpoint: identity.endpoint,
          key: identity.key,
          fingerprint: identity.fingerprint,
        },
      })

      return { kind: 'reserved' }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error

      return this.inspectExisting(identity)
    }
  }

  /**
   * La clé est prise : par qui, et dans quel état ?
   *
   * L'empreinte est comparée **avant** le statut : une clé réutilisée avec un
   * autre corps est un bug client, qu'elle ait ou non déjà répondu. Servir le
   * rejeu dans ce cas renverrait la réponse d'une autre requête à un appelant
   * persuadé d'avoir posté la sienne.
   */
  private async inspectExisting(identity: IdempotencyIdentity): Promise<ReservationOutcome> {
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: locate(identity) })

    // Course extrême : la réservation concurrente a été libérée entre notre
    // insertion refusée et cette lecture. On répond comme pour une requête en
    // vol — 409 invite à réessayer, ce qui est exactement l'issue voulue.
    if (existing === null) return { kind: 'in-flight' }

    if (existing.fingerprint !== identity.fingerprint) return { kind: 'payload-mismatch' }

    // `status` nul signifie « réservée, pas encore répondu » : une autre requête
    // porte la même clé et n'a pas fini.
    if (existing.status === null) return { kind: 'in-flight' }

    return { kind: 'replay', status: existing.status, body: existing.body }
  }

  async complete(identity: IdempotencyIdentity, status: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: locate(identity),
      data: { status, body: body as Prisma.InputJsonValue },
    })
  }

  async release(identity: IdempotencyIdentity): Promise<void> {
    // `deleteMany` et non `delete` : la ligne peut déjà avoir disparu, et un
    // `delete` lèverait alors une seconde erreur par-dessus celle qui a provoqué
    // la libération — masquant la cause réelle de l'échec.
    await this.prisma.idempotencyRecord.deleteMany({
      where: { userId: identity.userId, endpoint: identity.endpoint, key: identity.key },
    })
  }
}
