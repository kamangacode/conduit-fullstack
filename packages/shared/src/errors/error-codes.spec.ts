import { describe, expect, it } from 'vitest'
import { CONDUIT_ERROR_CODES, CONDUIT_ERROR_STATUS, conduitErrorCodeSchema } from './error-codes'

describe('CONDUIT_ERROR_STATUS', () => {
  it('associe chaque code métier au statut de la spec §10', () => {
    expect(CONDUIT_ERROR_STATUS).toEqual({
      validation_failed: 422,
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
    })
  })

  it('couvre exhaustivement les codes déclarés — aucun code sans statut', () => {
    expect(Object.keys(CONDUIT_ERROR_STATUS).sort()).toEqual([...CONDUIT_ERROR_CODES].sort())
  })
})

describe('conduitErrorCodeSchema', () => {
  it('accepte chacun des codes déclarés', () => {
    for (const code of CONDUIT_ERROR_CODES) {
      expect(conduitErrorCodeSchema.parse(code)).toBe(code)
    }
  })

  it('refuse un code inconnu', () => {
    expect(conduitErrorCodeSchema.safeParse('teapot').success).toBe(false)
  })

  it('refuse un statut HTTP passé à la place du code métier', () => {
    expect(conduitErrorCodeSchema.safeParse(404).success).toBe(false)
  })
})
