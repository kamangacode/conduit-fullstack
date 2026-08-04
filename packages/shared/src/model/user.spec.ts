import { describe, expect, it } from 'vitest'
import {
  loginDtoSchema,
  PASSWORD_MIN_LENGTH,
  registerDtoSchema,
  updateUserDtoSchema,
  userResponseSchema,
  userSchema,
} from './user'

/** Exemple verbatim du PRD §8 (« Users for authentication »). */
const userFromSpec = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: 'I work at statefarm',
  image: null,
}

describe('userSchema', () => {
  it("accepte l'utilisateur verbatim de la spec", () => {
    expect(userSchema.parse(userFromSpec)).toEqual(userFromSpec)
  })

  it('ne laisse pas passer un mot de passe dans la sortie (règle R-9)', () => {
    const withLeak = { ...userFromSpec, password: 'jakejake' }

    expect(userSchema.parse(withLeak)).not.toHaveProperty('password')
  })

  it('exige le token : sans lui le client ne peut pas authentifier la suite', () => {
    const { token: _omitted, ...withoutToken } = userFromSpec

    expect(userSchema.safeParse(withoutToken).success).toBe(false)
  })

  it('accepte une bio nulle (compte fraîchement créé)', () => {
    expect(userSchema.parse({ ...userFromSpec, bio: null }).bio).toBeNull()
  })
})

describe('userResponseSchema', () => {
  it("valide l'enveloppe { user: … }", () => {
    expect(userResponseSchema.parse({ user: userFromSpec })).toEqual({ user: userFromSpec })
  })
})

describe('loginDtoSchema', () => {
  it('accepte les identifiants de la spec', () => {
    const credentials = { email: 'jake@jake.jake', password: 'jakejake' }

    expect(loginDtoSchema.parse(credentials)).toEqual(credentials)
  })

  it("n'impose pas la longueur minimale d'inscription — un compte plus ancien doit pouvoir tenter sa chance", () => {
    const shortSecret = 'x'.repeat(PASSWORD_MIN_LENGTH - 1)

    expect(
      loginDtoSchema.safeParse({ email: 'jake@jake.jake', password: shortSecret }).success
    ).toBe(true)
  })

  it('refuse un mot de passe vide', () => {
    expect(loginDtoSchema.safeParse({ email: 'jake@jake.jake', password: '' }).success).toBe(false)
  })

  it('refuse un email malformé', () => {
    expect(loginDtoSchema.safeParse({ email: 'jake', password: 'jakejake' }).success).toBe(false)
  })
})

describe('registerDtoSchema', () => {
  it("accepte l'inscription de la spec", () => {
    const registration = { username: 'Jacob', email: 'jake@jake.jake', password: 'jakejake' }

    expect(registerDtoSchema.parse(registration)).toEqual(registration)
  })

  it('refuse un mot de passe plus court que PASSWORD_MIN_LENGTH', () => {
    const tooShort = 'x'.repeat(PASSWORD_MIN_LENGTH - 1)

    expect(
      registerDtoSchema.safeParse({
        username: 'Jacob',
        email: 'jake@jake.jake',
        password: tooShort,
      }).success
    ).toBe(false)
  })

  it('refuse un username vide une fois les espaces retirés', () => {
    expect(
      registerDtoSchema.safeParse({
        username: '   ',
        email: 'jake@jake.jake',
        password: 'jakejake',
      }).success
    ).toBe(false)
  })

  it('exige les trois champs (§7.1 : username, email, password)', () => {
    expect(
      registerDtoSchema.safeParse({ email: 'jake@jake.jake', password: 'jakejake' }).success
    ).toBe(false)
  })
})

describe('updateUserDtoSchema', () => {
  it('accepte une mise à jour partielle — le corps de la spec §7.1', () => {
    const patch = {
      email: 'jake@jake.jake',
      bio: 'I like to skateboard',
      image: 'https://i.stack.imgur.com/xHWG8.jpg',
    }

    expect(updateUserDtoSchema.parse(patch)).toEqual(patch)
  })

  it("accepte un corps vide : ne rien changer n'est pas une erreur de validation", () => {
    expect(updateUserDtoSchema.parse({})).toEqual({})
  })

  it('distingue effacer la bio (null) de ne pas y toucher (absente)', () => {
    expect(updateUserDtoSchema.parse({ bio: null })).toEqual({ bio: null })
    expect(updateUserDtoSchema.parse({})).not.toHaveProperty('bio')
  })

  it('applique la politique de mot de passe quand le champ est fourni', () => {
    expect(updateUserDtoSchema.safeParse({ password: 'court' }).success).toBe(false)
  })
})
