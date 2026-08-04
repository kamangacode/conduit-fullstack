import { z } from 'zod'

/** Nombre d'articles renvoyés par défaut (règle R-10). */
export const DEFAULT_PAGE_LIMIT = 20

/** Décalage par défaut (règle R-10). */
export const DEFAULT_PAGE_OFFSET = 0

/**
 * Pagination des endpoints de liste (`GET /api/articles`, `/api/articles/feed`).
 *
 * Deux choix méritent d'être explicités :
 *
 * - `z.coerce` : une query string ne transporte que des chaînes. Convertir ici,
 *   au bord, évite que chaque use case reçoive un `string | undefined` et
 *   refasse le même `Number.parseInt` — avec le risque qu'un seul oublie le
 *   contrôle de validité.
 * - `.default(...)` : les valeurs par défaut de R-10 sont portées par le schéma,
 *   donc appliquées identiquement par l'API et par le client qui construit
 *   l'URL. Après parse, `limit` et `offset` sont toujours des nombres — les
 *   couches en aval n'ont plus de cas « absent » à traiter.
 *
 * Aucune borne haute sur `limit` : le contrat RealWorld n'en définit pas, et en
 * ajouter une ici ferait dévier les réponses de la spec. Le plafonnement relève
 * du durcissement (rate limiting, Phase 5), pas du modèle partagé.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().nonnegative().default(DEFAULT_PAGE_OFFSET),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>
