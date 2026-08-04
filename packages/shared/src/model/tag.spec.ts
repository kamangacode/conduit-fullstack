import { describe, expect, it } from 'vitest'
import { tagSchema, tagsResponseSchema } from './tag'

describe('tagSchema', () => {
  it('accepte un tag de la spec', () => {
    expect(tagSchema.parse('dragons')).toBe('dragons')
  })

  it('normalise les espaces de bord — sans quoi « dragons » existerait en double', () => {
    expect(tagSchema.parse('  dragons  ')).toBe('dragons')
  })

  it("refuse un tag qui n'est que de l'espace (vide après normalisation)", () => {
    expect(tagSchema.safeParse('   ').success).toBe(false)
  })

  it('refuse la chaîne vide', () => {
    expect(tagSchema.safeParse('').success).toBe(false)
  })
})

describe('tagsResponseSchema', () => {
  it("valide l'enveloppe { tags: [...] } de la spec §8", () => {
    expect(tagsResponseSchema.parse({ tags: ['reactjs', 'angularjs'] })).toEqual({
      tags: ['reactjs', 'angularjs'],
    })
  })

  it('accepte une liste vide (aucun article tagué encore publié)', () => {
    expect(tagsResponseSchema.parse({ tags: [] })).toEqual({ tags: [] })
  })

  it('refuse un tableau de tags nu, sans enveloppe', () => {
    expect(tagsResponseSchema.safeParse(['reactjs']).success).toBe(false)
  })
})
