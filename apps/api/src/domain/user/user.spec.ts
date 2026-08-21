import { describe, expect, it } from 'vitest'
import { UserEntity, type UserProps } from './user'

/**
 * Tests unitaires du domaine : zéro mock, zéro I/O (rule 16). L'entité est du
 * TypeScript pur, donc tout ce qu'elle promet est vérifiable sans infrastructure.
 *
 * Les projections publique et privée du compte ont quitté l'entité avec l'ADR
 * 031. Leurs tests les ont suivies : `application/profile/ports/profile-view.spec.ts`
 * et `application/user/ports/account-view.spec.ts`. Ce fichier ne garde que ce
 * que l'entité décide encore, c'est-à-dire ses règles de mise à jour.
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

    expect(updated.username).toBe(baseProps.username)
    expect(updated.bio).toBe(baseProps.bio)
    expect(updated.image).toBe(baseProps.image)
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
