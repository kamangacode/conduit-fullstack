import { describe, expect, it } from 'vitest'
import { CONDUIT_ERROR_CODES, CONDUIT_ERROR_STATUS, conduitErrorCodeSchema } from './error-codes'

describe('REQ-ERROR-001 — CONDUIT_ERROR_STATUS', () => {
  it('AC-1: associe chaque code métier au statut de la spec §10', () => {
    expect(CONDUIT_ERROR_STATUS).toEqual({
      validation_failed: 422,
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
    })
  })

  it('AC-1: distingue le conflit d’unicité (409) de l’échec de validation (422)', () => {
    // Frontière posée par l'ADR 009 : ce qu'un schéma peut refuser seul est un
    // 422, ce qui exige d'interroger la base est un 409. Les confondre ferait
    // passer un email déjà pris pour une charge utile malformée.
    expect(CONDUIT_ERROR_STATUS.conflict).not.toBe(CONDUIT_ERROR_STATUS.validation_failed)
  })

  it('AC-1: couvre exhaustivement les codes déclarés — aucun code sans statut', () => {
    expect(Object.keys(CONDUIT_ERROR_STATUS).sort()).toEqual([...CONDUIT_ERROR_CODES].sort())
  })
})

describe('REQ-ERROR-001 — conduitErrorCodeSchema', () => {
  it('AC-2: accepte chacun des codes déclarés', () => {
    for (const code of CONDUIT_ERROR_CODES) {
      expect(conduitErrorCodeSchema.parse(code)).toBe(code)
    }
  })

  it('AC-2: refuse un code inconnu', () => {
    expect(conduitErrorCodeSchema.safeParse('teapot').success).toBe(false)
  })

  it('AC-2: refuse un statut HTTP passé à la place du code métier', () => {
    expect(conduitErrorCodeSchema.safeParse(404).success).toBe(false)
  })
})
