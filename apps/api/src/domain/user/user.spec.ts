import { describe, expect, it } from 'vitest'
import { UserEntity, type UserProps } from './user'

/**
 * Tests unitaires du domaine : zéro mock, zéro I/O (rule 16). L'entité est du
 * TypeScript pur, donc tout ce qu'elle promet est vérifiable sans infrastructure.
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
    const profile = aUser().toProfile(false)

    // Assertion sur les clés RÉELLEMENT présentes, et pas seulement sur la
    // présence des quatre attendues : `toMatchObject` ou quatre `toBe`
    // passeraient tout aussi bien avec un `email` en trop dans la réponse.
    expect(Object.keys(profile).sort()).toEqual(['bio', 'following', 'image', 'username'])
  })

  it('AC-4: ne laisse fuiter ni l’email ni le condensat du mot de passe', () => {
    const profile = aUser().toProfile(true)

    // Sérialisation complète plutôt qu'inspection clé à clé : c'est sous cette
    // forme que la valeur part sur le réseau, donc la seule qui prouve l'absence.
    const serialized = JSON.stringify(profile)
    expect(serialized).not.toContain(baseProps.email)
    expect(serialized).not.toContain(baseProps.passwordHash)
  })

  it('AC-1: rapporte following à false quand l’appelant ne suit pas la cible', () => {
    expect(aUser().toProfile(false).following).toBe(false)
  })

  it('AC-2: rapporte following à true quand l’appelant suit la cible', () => {
    expect(aUser().toProfile(true).following).toBe(true)
  })

  it('AC-1: rend le même profil pour deux appelants différents, hors following', () => {
    // R-5 : `following` est la SEULE part de la représentation qui dépend de
    // l'appelant. Si un autre champ en dépendait un jour, ce test le dirait.
    const { following: _anonymous, ...anonymousView } = aUser().toProfile(false)
    const { following: _follower, ...followerView } = aUser().toProfile(true)

    expect(anonymousView).toEqual(followerView)
  })

  it('AC-4: transporte une bio absente telle quelle, sans la remplacer par une chaîne vide', () => {
    // ADR 004 : `null` (jamais renseignée) et `""` (effacée) sont deux valeurs
    // distinctes que la projection ne doit pas confondre.
    expect(aUser({ bio: null }).toProfile(false).bio).toBeNull()
    expect(aUser({ bio: '' }).toProfile(false).bio).toBe('')
  })
})

describe('REQ-USER-001 — projection privée du compte authentifié', () => {
  it('AC-1: porte email, token, username, bio et image sous la forme du contrat', () => {
    const user = aUser().toUser('jwt.token.here')

    expect(Object.keys(user).sort()).toEqual(['bio', 'email', 'image', 'token', 'username'])
    expect(user.token).toBe('jwt.token.here')
    expect(user.email).toBe(baseProps.email)
  })

  it('AC-2: ne transporte jamais le condensat du mot de passe (R-9)', () => {
    // La projection privée est la plus proche de l'état complet, donc celle où
    // un `...this.props` serait le plus tentant — et le plus coûteux.
    const serialized = JSON.stringify(aUser().toUser('jwt.token.here'))

    expect(serialized).not.toContain(baseProps.passwordHash)
    expect(serialized).not.toContain('passwordHash')
  })

  it('AC-1: n’expose pas l’identifiant interne du compte', () => {
    // L'identité publique est le username (PRD §7.2) ; l'UUID reste interne.
    expect(JSON.stringify(aUser().toUser('jwt'))).not.toContain(baseProps.id)
  })
})

describe('REQ-USER-004 — mise à jour partielle du compte', () => {
  it('AC-3: ne modifie que les champs présents dans la demande', () => {
    const updated = aUser().withChanges({ bio: 'I like to skateboard' })

    expect(updated.bio).toBe('I like to skateboard')
    expect(updated.email).toBe(baseProps.email)
    expect(updated.username).toBe(baseProps.username)
    expect(updated.image).toBe(baseProps.image)
    expect(updated.passwordHash).toBe(baseProps.passwordHash)
  })

  it('AC-3: laisse le compte intact quand la demande est vide', () => {
    const updated = aUser().withChanges({})

    expect(updated.toProfile(false)).toEqual(aUser().toProfile(false))
    expect(updated.email).toBe(baseProps.email)
  })

  it('AC-3: efface un champ envoyé à null, sans restituer l’ancienne valeur', () => {
    // Le piège que ce test existe pour attraper : une implémentation écrite avec
    // `changes.bio ?? this.bio` restituerait l'ancienne bio, transformant un
    // effacement demandé en non-opération silencieuse.
    const updated = aUser().withChanges({ bio: null, image: null })

    expect(updated.bio).toBeNull()
    expect(updated.image).toBeNull()
  })

  it('AC-3: distingue un champ absent d’un champ à null', () => {
    const cleared = aUser().withChanges({ image: null })
    const untouched = aUser().withChanges({})

    expect(cleared.image).toBeNull()
    expect(untouched.image).toBe(baseProps.image)
  })

  it('AC-3: ne mute pas l’instance d’origine', () => {
    const original = aUser()
    original.withChanges({ bio: 'autre chose', email: 'autre@exemple.test' })

    expect(original.bio).toBe(baseProps.bio)
    expect(original.email).toBe(baseProps.email)
  })

  it('AC-3: conserve l’identifiant, qu’aucune mise à jour ne peut changer', () => {
    // `UserChanges` ne déclare pas `id` : le test verrouille l'intention côté
    // exécution, pour qu'un élargissement du type ne passe pas inaperçu.
    const updated = aUser().withChanges({ username: 'jacob' })

    expect(updated.id).toBe(baseProps.id)
  })

  it('AC-4: remplace le condensat quand un nouveau mot de passe est haché', () => {
    const rehashed = aUser().withChanges({ passwordHash: '$argon2id$v=19$nouveau' })

    expect(rehashed.passwordHash).toBe('$argon2id$v=19$nouveau')
    expect(rehashed.passwordHash).not.toBe(baseProps.passwordHash)
  })
})
