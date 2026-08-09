import { describe, expect, it } from 'vitest'
import { contractViolation } from './contract-assertion'
import { staleContracts, undeclaredRoutes } from './contract-registry-check'
import { ROUTE_CONTRACTS } from './route-contracts'

/**
 * Le harnais de contrat, éprouvé contre lui-même (REQ-ARCH-002, ADR 026).
 *
 * Ces tests ne visent pas l'API : ils visent l'outil qui la surveille. Un
 * harnais qui rendrait toujours « conforme » afficherait du vert sur les 137
 * tests d'intégration sans rien prouver, et personne ne s'en apercevrait — le
 * dépôt a déjà attrapé un faux `ok` de cette famille sur un `grep` (E3) et un
 * plugin Biome mort à code de sortie 0 (ADR 024).
 *
 * D'où la présence, à côté de chaque refus attendu, du **contrôle inverse** :
 * un corps exactement conforme doit passer. Sans lui, un harnais qui refuserait
 * tout satisferait chacun des cas de refus ci-dessous.
 *
 * Lane unit : aucune base, aucune application NestJS. Ce qui est testé ici est
 * de la logique pure ; le câblage sur l'application réelle est éprouvé par
 * `test/integration/contract-harness.integration.spec.ts`.
 */

/** Corps de réponse exactement conforme au contrat de `POST /api/users`. */
const conformingUser = {
  user: {
    email: 'jake@jake.jake',
    token: 'jwt.de.test',
    username: 'jake',
    bio: null,
    image: null,
  },
}

describe('REQ-ARCH-002 — le harnais de contrat refuse ce qu’il doit refuser', () => {
  it('AC-2: accepte un corps exactement conforme (contrôle sans lequel un harnais qui refuse tout passerait tous les autres cas)', () => {
    expect(contractViolation('POST /api/users', conformingUser)).toBeNull()
  })

  it('AC-2: refuse un corps portant une clé inconnue du schéma, et la nomme', () => {
    const leaking = {
      user: { ...conformingUser.user, passwordHash: '$argon2id$v=19$…' },
    }

    const violation = contractViolation('POST /api/users', leaking)

    expect(violation).not.toBeNull()
    expect(violation).toContain('user.passwordHash')
  })

  it('AC-2: refuse une clé inconnue imbriquée dans un élément de liste', () => {
    const leaking = {
      comments: [
        {
          id: 1,
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
          body: 'Bien vu.',
          author: {
            username: 'jake',
            bio: null,
            image: null,
            following: false,
            email: 'jake@jake.jake',
          },
        },
      ],
    }

    const violation = contractViolation('GET /api/articles/:slug/comments', leaking)

    expect(violation).toContain('comments[0].author.email')
  })

  it('AC-3: refuse un corps amputé d’un champ du contrat', () => {
    const { token: _token, ...withoutToken } = conformingUser.user

    const violation = contractViolation('POST /api/users', { user: withoutToken })

    expect(violation).not.toBeNull()
    expect(violation).toContain('token')
  })

  it('AC-3: refuse un corps dont un champ porte le mauvais type', () => {
    const mistyped = {
      article: {
        slug: 'how-to-train-your-dragon',
        title: 'How to train your dragon',
        description: 'Ever wonder how?',
        body: 'You have to believe',
        tagList: ['dragons'],
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:00.000Z',
        favorited: false,
        // Le contrat impose un entier ; « 3 » est ce qu'un ORM rendrait sur une
        // colonne agrégée mal projetée, et se rend en JSON sans broncher.
        favoritesCount: '3',
        author: { username: 'jake', bio: null, image: null, following: false },
      },
    }

    const violation = contractViolation('GET /api/articles/:slug', mistyped)

    expect(violation).not.toBeNull()
    expect(violation).toContain('favoritesCount')
  })

  it('AC-5: accepte une réponse sans corps sur une route déclarée sans corps', () => {
    expect(contractViolation('DELETE /api/articles/:slug', undefined)).toBeNull()
  })

  it('AC-5: refuse un corps sur une route déclarée sans corps', () => {
    const violation = contractViolation('DELETE /api/articles/:slug', { article: {} })

    expect(violation).not.toBeNull()
    expect(violation).toContain('sans corps')
  })

  it('AC-4: refuse une réponse dont la route est absente du registre', () => {
    const violation = contractViolation('GET /api/nouveaute', { quelque: 'chose' })

    expect(violation).not.toBeNull()
    expect(violation).toContain('GET /api/nouveaute')
  })

  it('AC-4: laisse passer une route déclarée hors contrat', () => {
    expect(contractViolation('GET /health', { status: 'ok' })).toBeNull()
  })
})

describe('REQ-ARCH-002 — le registre couvre exactement les routes montées', () => {
  const declared = Object.keys(ROUTE_CONTRACTS)

  it('AC-4: nomme une route montée qui n’est déclarée nulle part', () => {
    expect(undeclaredRoutes([...declared, 'GET /api/nouveaute'])).toEqual(['GET /api/nouveaute'])
  })

  it('AC-4: ne signale rien quand le registre et les routes montées coïncident', () => {
    expect(undeclaredRoutes(declared)).toEqual([])
    expect(staleContracts(declared)).toEqual([])
  })

  it('AC-4: nomme une déclaration devenue orpheline (route supprimée, entrée oubliée)', () => {
    const withoutTags = declared.filter((key) => key !== 'GET /api/tags')

    expect(staleContracts(withoutTags)).toEqual(['GET /api/tags'])
  })
})
