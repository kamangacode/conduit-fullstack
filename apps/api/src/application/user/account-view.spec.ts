import { describe, expect, it } from 'vitest'
import { UserEntity, type UserProps } from '../../domain/user/user'
import { toAccountView } from './account-view'

/**
 * Ces tests vivaient dans `domain/user/user.spec.ts`, quand la projection privée
 * était la méthode `toUser(token)` de `UserEntity`. Ils l'ont suivie ici avec
 * l'ADR 031.
 *
 * Ce que la migration change pour eux : la garantie « jamais de `passwordHash` »
 * ne repose plus seulement sur une énumération vigilante, mais sur le type
 * `AccountView`, qui ne déclare pas le champ. Les tests restent, parce qu'un
 * type protège de l'ajout accidentel, pas d'une décision de l'ajouter.
 */

const baseProps: UserProps = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  email: 'jake@jake.jake',
  username: 'jake',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2VsMDAwMA$condensat',
  bio: 'I work at statefarm',
  image: 'https://api.realworld.io/images/smiley-cyrus.jpg',
}

const aUser = (overrides: Partial<UserProps> = {}): UserEntity =>
  UserEntity.fromProps({ ...baseProps, ...overrides })

describe('REQ-USER-001 — projection privée du compte authentifié', () => {
  it('AC-1: porte email, token, username, bio et image', () => {
    const account = toAccountView(aUser(), 'jwt.token.here')

    expect(Object.keys(account).sort()).toEqual(['bio', 'email', 'image', 'token', 'username'])
    expect(account.token).toBe('jwt.token.here')
    expect(account.email).toBe(baseProps.email)
  })

  it('AC-2: ne transporte jamais le condensat du mot de passe (R-9)', () => {
    // La projection privée est la plus proche de l'état complet, donc celle où
    // un étalement de l'entité serait le plus tentant — et le plus coûteux.
    const serialized = JSON.stringify(toAccountView(aUser(), 'jwt.token.here'))

    expect(serialized).not.toContain(baseProps.passwordHash)
    expect(serialized).not.toContain('passwordHash')
  })

  it('AC-1: n’expose pas l’identifiant interne du compte', () => {
    // L'identité publique est le username (PRD §7.2) ; l'UUID reste interne.
    expect(JSON.stringify(toAccountView(aUser(), 'jwt'))).not.toContain(baseProps.id)
  })
})
