import { describe, expect, it } from 'vitest'
import { UserEntity, type UserProps } from '../../../domain/user/user'
import { toProfileView } from './profile-view'

/**
 * Ces tests vivaient dans `domain/user/user.spec.ts`, quand la projection
 * publique était une méthode de `UserEntity`. Ils l'ont suivie ici avec l'ADR
 * 031 : ils vérifient ce que la projection expose, ce qu'elle cache, et ce qui
 * dépend du lecteur.
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

describe('REQ-PROFILE-002 — projection publique du compte', () => {
  it('AC-4: n’expose que username, bio, image et following', () => {
    const profile = toProfileView(aUser(), false)

    // Assertion sur les clés RÉELLEMENT présentes, et pas seulement sur la
    // présence des quatre attendues : `toMatchObject` ou quatre `toBe`
    // passeraient tout aussi bien avec un `email` en trop dans la réponse.
    expect(Object.keys(profile).sort()).toEqual(['bio', 'following', 'image', 'username'])
  })

  it('AC-4: ne laisse fuiter ni l’email ni le condensat du mot de passe', () => {
    const profile = toProfileView(aUser(), true)

    // Sérialisation complète plutôt qu'inspection clé à clé : c'est sous cette
    // forme que la valeur part sur le réseau, donc la seule qui prouve l'absence.
    const serialized = JSON.stringify(profile)
    expect(serialized).not.toContain(baseProps.email)
    expect(serialized).not.toContain(baseProps.passwordHash)
  })

  it('AC-1: rapporte following à false quand l’appelant ne suit pas la cible', () => {
    expect(toProfileView(aUser(), false).following).toBe(false)
  })

  it('AC-2: rapporte following à true quand l’appelant suit la cible', () => {
    expect(toProfileView(aUser(), true).following).toBe(true)
  })

  it('AC-1: rend le même profil pour deux appelants différents, hors following', () => {
    // R-5 : `following` est la SEULE part de la représentation qui dépend de
    // l'appelant. Si un autre champ en dépendait un jour, ce test le dirait.
    const { following: _anonymous, ...anonymousView } = toProfileView(aUser(), false)
    const { following: _follower, ...followerView } = toProfileView(aUser(), true)

    expect(anonymousView).toEqual(followerView)
  })

  it('AC-4: transporte une bio absente telle quelle, sans la remplacer par une chaîne vide', () => {
    // ADR 004 : `null` (jamais renseignée) et `""` (effacée) sont deux valeurs
    // distinctes que la projection ne doit pas confondre.
    expect(toProfileView(aUser({ bio: null }), false).bio).toBeNull()
    expect(toProfileView(aUser({ bio: '' }), false).bio).toBe('')
  })
})
