import { describe, expect, it } from 'vitest'
import type { ProfileView } from '../../application/profile/ports/profile-view'
import { toProfileResponse } from './profile.mapper'

/**
 * Pendant de `user.mapper.spec.ts` : `profile-view.spec.ts` couvre la projection
 * applicative, celui-ci couvre ce qui part sur le fil.
 */

const aView = (overrides: Partial<ProfileView> = {}): ProfileView => ({
  username: 'jake',
  bio: 'I work at statefarm',
  image: 'https://api.realworld.io/images/smiley-cyrus.jpg',
  following: false,
  ...overrides,
})

describe('REQ-PROFILE-002 — forme du profil public (PRD §8)', () => {
  it('AC-4: produit exactement les quatre clés du contrat', () => {
    expect(Object.keys(toProfileResponse(aView())).sort()).toEqual([
      'bio',
      'following',
      'image',
      'username',
    ])
  })

  it('AC-4: ne laisse fuiter ni email ni condensat, même sérialisé', () => {
    const serialized = JSON.stringify(toProfileResponse(aView()))

    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('passwordHash')
  })

  it('AC-1: rapporte le following que le cas d’usage a résolu, sans le réinterpréter', () => {
    // Le mapper ne recalcule rien : `following` appartient au couple
    // (appelant, cible) et a été tranché en amont (R-5).
    expect(toProfileResponse(aView({ following: true })).following).toBe(true)
    expect(toProfileResponse(aView({ following: false })).following).toBe(false)
  })
})
