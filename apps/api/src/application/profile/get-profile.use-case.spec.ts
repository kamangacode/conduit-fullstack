import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  InMemoryFollowRepository,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { GetProfileUseCase } from './get-profile.use-case'

const jake = aUserProps({ email: 'jake@jake.jake', username: 'jake', bio: 'I work at statefarm' })
const jacob = aUserProps({ email: 'jacob@jake.jake', username: 'jacob' })

const buildUseCase = (links: Array<[string, string]> = []) => {
  const users = new InMemoryUserRepository([jake, jacob])
  const follows = new InMemoryFollowRepository(links)
  return { useCase: new GetProfileUseCase(users, follows), follows }
}

describe('REQ-PROFILE-002 — consultation d’un profil', () => {
  it('AC-1: renvoie following à false pour un appelant anonyme', async () => {
    const { useCase } = buildUseCase([[jacob.id, jake.id]])

    const profile = await useCase.execute({ username: 'jake', viewerId: null })

    // La relation EXISTE en base (jacob suit jake), mais l'appelant est anonyme :
    // R-5 impose `false`. Sans le jeu de données peuplé, ce test passerait aussi
    // avec une implémentation qui ignorerait la relation.
    expect(profile.following).toBe(false)
  })

  it('AC-1: n’interroge pas le dépôt de suivi quand l’appelant est anonyme', async () => {
    const { useCase, follows } = buildUseCase()
    const isFollowing = follows.isFollowing.bind(follows)
    let calls = 0
    follows.isFollowing = async (a: string, b: string) => {
      calls += 1
      return isFollowing(a, b)
    }

    await useCase.execute({ username: 'jake', viewerId: null })

    expect(calls).toBe(0)
  })

  it('AC-2: renvoie following à true quand l’appelant suit la cible', async () => {
    const { useCase } = buildUseCase([[jacob.id, jake.id]])

    const profile = await useCase.execute({ username: 'jake', viewerId: jacob.id })

    expect(profile.following).toBe(true)
  })

  it('AC-2: renvoie following à false quand l’appelant ne suit pas la cible', async () => {
    const { useCase } = buildUseCase()

    const profile = await useCase.execute({ username: 'jake', viewerId: jacob.id })

    expect(profile.following).toBe(false)
  })

  it('AC-2: tient compte du sens de la relation, qui est orientée', async () => {
    // jake suit jacob, mais pas l'inverse. Une implémentation qui inverserait les
    // deux identifiants passerait tous les tests précédents.
    const { useCase } = buildUseCase([[jake.id, jacob.id]])

    const seenByJacob = await useCase.execute({ username: 'jake', viewerId: jacob.id })

    expect(seenByJacob.following).toBe(false)
  })

  it('AC-3: refuse un username qui ne désigne aucun compte', async () => {
    const { useCase } = buildUseCase()

    await expect(useCase.execute({ username: 'personne', viewerId: null })).rejects.toBeInstanceOf(
      UserNotFoundError
    )
  })

  it('AC-4: n’expose que les quatre champs du contrat', async () => {
    const { useCase } = buildUseCase()

    const profile = await useCase.execute({ username: 'jake', viewerId: null })

    expect(Object.keys(profile).sort()).toEqual(['bio', 'following', 'image', 'username'])
    expect(JSON.stringify(profile)).not.toContain(jake.email)
  })
})
