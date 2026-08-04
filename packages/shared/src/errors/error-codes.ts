import { z } from 'zod'

/**
 * Les quatre situations d'erreur du contrat Conduit (PRD §10).
 *
 * Ce sont des codes **métier**, pas des statuts HTTP. La distinction porte
 * l'architecture hexagonale (`.claude/rules/12-backend-hexagonal.md`) : le
 * domaine et les use cases signalent « pas trouvé » ou « interdit » sans jamais
 * connaître HTTP, et seule la couche `interface` traduit en statut via
 * `CONDUIT_ERROR_STATUS`. Un `404` écrit dans un use case, c'est du transport
 * qui a fui dans le métier.
 */
export const CONDUIT_ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
] as const

export type ConduitErrorCode = (typeof CONDUIT_ERROR_CODES)[number]

/** Schéma de validation du code, pour les frontières qui le transportent. */
export const conduitErrorCodeSchema = z.enum(CONDUIT_ERROR_CODES)

/**
 * Traduction code métier → statut HTTP (PRD §10).
 *
 * `satisfies` plutôt qu'une annotation `Record<…>` : la table reste exhaustive
 * (ajouter un code sans son statut ne compile plus) tout en conservant les
 * valeurs littérales à la lecture.
 */
export const CONDUIT_ERROR_STATUS = {
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
} as const satisfies Record<ConduitErrorCode, number>
