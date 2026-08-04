import { describe, expect, it } from 'vitest'
import { profileResponseSchema, profileSchema } from './profile'

/** Exemple verbatim du PRD §8 (« Profile »). */
const profileFromSpec = {
  username: 'jake',
  bio: 'I work at statefarm',
  image: 'https://api.realworld.io/images/smiley-cyrus.jpg',
  following: false,
}

describe('REQ-PROFILE-001 — profileSchema', () => {
  it('AC-1: accepte le profil verbatim de la spec', () => {
    expect(profileSchema.parse(profileFromSpec)).toEqual(profileFromSpec)
  })

  it('AC-1: accepte bio et image nulles (contrat openapi : type [string, null])', () => {
    const anonymousAvatar = { ...profileFromSpec, bio: null, image: null }

    expect(profileSchema.parse(anonymousAvatar)).toEqual(anonymousAvatar)
  })

  it('AC-2: exige following : le champ relatif R-5 est toujours porté, jamais omis', () => {
    const { following: _omitted, ...withoutFollowing } = profileFromSpec

    expect(profileSchema.safeParse(withoutFollowing).success).toBe(false)
  })

  it('AC-2: refuse un following sérialisé en chaîne', () => {
    expect(profileSchema.safeParse({ ...profileFromSpec, following: 'false' }).success).toBe(false)
  })

  it('AC-1: refuse un username absent', () => {
    const { username: _omitted, ...withoutUsername } = profileFromSpec

    expect(profileSchema.safeParse(withoutUsername).success).toBe(false)
  })
})

describe('REQ-PROFILE-001 — profileResponseSchema', () => {
  it("AC-1: valide l'enveloppe { profile: … } du contrat", () => {
    expect(profileResponseSchema.parse({ profile: profileFromSpec })).toEqual({
      profile: profileFromSpec,
    })
  })

  it('AC-1: refuse un profil renvoyé sans son enveloppe', () => {
    expect(profileResponseSchema.safeParse(profileFromSpec).success).toBe(false)
  })
})
