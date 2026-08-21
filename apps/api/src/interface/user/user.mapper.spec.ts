import { describe, expect, it } from 'vitest'
import type { AccountView } from '../../application/user/account-view'
import { toUserResponse } from './user.mapper'

/**
 * `account-view.spec.ts` prouve que la **projection applicative** ne porte ni
 * l'email d'un autre compte, ni le condensat, ni l'identifiant interne. Ce
 * fichier prouve la même chose un cran plus loin, sur ce qui part réellement sur
 * le fil.
 *
 * La distinction n'est pas rhétorique : entre les deux se trouve le seul endroit
 * qui pourrait ajouter un champ, et c'est précisément le genre de couche qu'on
 * oublie de tester parce qu'elle « ne fait que recopier ».
 */

const aView = (overrides: Partial<AccountView> = {}): AccountView => ({
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: 'I work at statefarm',
  image: 'https://api.realworld.io/images/smiley-cyrus.jpg',
  ...overrides,
})

describe('REQ-USER-001 — forme de la réponse d’authentification (PRD §8, §9)', () => {
  it('AC-1: produit exactement les cinq clés du contrat', () => {
    expect(Object.keys(toUserResponse(aView())).sort()).toEqual([
      'bio',
      'email',
      'image',
      'token',
      'username',
    ])
  })

  it('AC-2: ne transporte jamais de condensat, même sérialisé', () => {
    // Assertion sur la chaîne JSON, pas sur l'objet : c'est sous cette forme que
    // la valeur part sur le réseau.
    const serialized = JSON.stringify(toUserResponse(aView()))

    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('argon2')
  })

  it('AC-1: transporte une bio absente telle quelle, sans la remplacer par une chaîne vide', () => {
    // ADR 004 : `null` (jamais renseignée) et `""` (effacée) sont deux valeurs
    // distinctes que le contrat distingue.
    expect(toUserResponse(aView({ bio: null })).bio).toBeNull()
    expect(toUserResponse(aView({ bio: '' })).bio).toBe('')
  })
})
