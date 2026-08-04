import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_LIMIT, DEFAULT_PAGE_OFFSET, paginationQuerySchema } from './pagination'

describe('paginationQuerySchema', () => {
  it('applique les défauts de la règle R-10 quand la query est vide', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 })
  })

  it('expose ces défauts comme constantes réutilisables', () => {
    expect(DEFAULT_PAGE_LIMIT).toBe(20)
    expect(DEFAULT_PAGE_OFFSET).toBe(0)
  })

  it('convertit les chaînes de la query string en nombres', () => {
    expect(paginationQuerySchema.parse({ limit: '5', offset: '10' })).toEqual({
      limit: 5,
      offset: 10,
    })
  })

  it('refuse un limit à zéro (une page vide ne pagine rien)', () => {
    expect(paginationQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
  })

  it('refuse un offset négatif', () => {
    expect(paginationQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })

  it('refuse un limit décimal', () => {
    expect(paginationQuerySchema.safeParse({ limit: '2.5' }).success).toBe(false)
  })

  it('refuse un limit non numérique plutôt que de retomber silencieusement sur le défaut', () => {
    expect(paginationQuerySchema.safeParse({ limit: 'beaucoup' }).success).toBe(false)
  })
})
