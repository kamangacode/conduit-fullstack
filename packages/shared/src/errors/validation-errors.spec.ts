import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  errorResponseSchema,
  fieldErrors,
  ROOT_ERROR_KEY,
  toErrorResponse,
} from './validation-errors'

/** Erreur produite par le parse d'un schéma donné, pour alimenter les cas ci-dessous. */
function zodErrorFrom(schema: z.ZodType, input: unknown): z.ZodError {
  const result = schema.safeParse(input)

  if (result.success) {
    throw new Error('le schéma a accepté une entrée censée être invalide')
  }

  return result.error
}

describe('REQ-ERROR-001 — errorResponseSchema', () => {
  it("AC-3: valide l'exemple verbatim de la spec §10", () => {
    const fromSpec = { errors: { body: ["can't be empty"] } }

    expect(errorResponseSchema.parse(fromSpec)).toEqual(fromSpec)
  })

  it('AC-3: refuse un message seul là où le contrat attend un tableau', () => {
    expect(errorResponseSchema.safeParse({ errors: { body: "can't be empty" } }).success).toBe(
      false
    )
  })

  it('AC-3: refuse un champ associé à un tableau vide', () => {
    expect(errorResponseSchema.safeParse({ errors: { body: [] } }).success).toBe(false)
  })
})

describe('REQ-ERROR-001 — toErrorResponse', () => {
  it('AC-4: indexe les messages par nom de champ', () => {
    const schema = z.object({ email: z.email(), password: z.string().min(8) })
    const response = toErrorResponse(zodErrorFrom(schema, { email: 'jake', password: 'court' }))

    expect(Object.keys(response.errors).sort()).toEqual(['email', 'password'])
    expect(response.errors.email).toHaveLength(1)
  })

  it('AC-4: regroupe plusieurs messages sous un même champ', () => {
    const schema = z.object({ username: z.string().min(5).regex(/^\d+$/) })
    const response = toErrorResponse(zodErrorFrom(schema, { username: 'jake' }))

    expect(response.errors.username).toHaveLength(2)
  })

  it("AC-4: retombe sur la clé racine quand l'erreur ne vise aucun champ", () => {
    const response = toErrorResponse(zodErrorFrom(z.string(), 42))

    expect(Object.keys(response.errors)).toEqual([ROOT_ERROR_KEY])
  })

  it('AC-4: aplatit un chemin imbriqué en clé pointée', () => {
    const schema = z.object({ user: z.object({ email: z.email() }) })
    const response = toErrorResponse(zodErrorFrom(schema, { user: { email: 'jake' } }))

    expect(Object.keys(response.errors)).toEqual(['user.email'])
  })

  it('AC-4: produit toujours une enveloppe conforme au contrat', () => {
    const schema = z.object({ title: z.string().min(1), body: z.string().min(1) })
    const response = toErrorResponse(zodErrorFrom(schema, {}))

    expect(errorResponseSchema.safeParse(response).success).toBe(true)
  })
})

describe('REQ-ERROR-001 — fieldErrors', () => {
  it('AC-5: construit une enveloppe conforme pour une règle métier (unicité R-8)', () => {
    expect(fieldErrors('email', 'has already been taken')).toEqual({
      errors: { email: ['has already been taken'] },
    })
  })

  it('AC-5: accepte plusieurs messages pour un même champ', () => {
    const response = fieldErrors('username', 'has already been taken', 'is reserved')

    expect(response.errors.username).toEqual(['has already been taken', 'is reserved'])
    expect(errorResponseSchema.safeParse(response).success).toBe(true)
  })
})
