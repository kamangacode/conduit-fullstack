import { describe, expect, it } from 'vitest'
import { tagSchema, tagsResponseSchema } from './tag'

describe('REQ-TAG-001 — tagSchema', () => {
  it('AC-1: accepte un tag de la spec', () => {
    expect(tagSchema.parse('dragons')).toBe('dragons')
  })

  it('AC-1: normalise les espaces de bord — sans quoi « dragons » existerait en double', () => {
    expect(tagSchema.parse('  dragons  ')).toBe('dragons')
  })

  it("AC-1: refuse un tag qui n'est que de l'espace (vide après normalisation)", () => {
    expect(tagSchema.safeParse('   ').success).toBe(false)
  })

  it('AC-1: refuse la chaîne vide', () => {
    expect(tagSchema.safeParse('').success).toBe(false)
  })
})

describe('REQ-TAG-001 — tagsResponseSchema', () => {
  it("AC-2: valide l'enveloppe { tags: [...] } de la spec §8", () => {
    expect(tagsResponseSchema.parse({ tags: ['reactjs', 'angularjs'] })).toEqual({
      tags: ['reactjs', 'angularjs'],
    })
  })

  it('AC-2: accepte une liste vide (aucun article tagué encore publié)', () => {
    expect(tagsResponseSchema.parse({ tags: [] })).toEqual({ tags: [] })
  })

  it('AC-2: refuse un tableau de tags nu, sans enveloppe', () => {
    expect(tagsResponseSchema.safeParse(['reactjs']).success).toBe(false)
  })
})
