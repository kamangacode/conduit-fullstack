import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  InMemoryFollowRepository,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { FollowUserUseCase } from './follow-user.use-case'

const jake = aUserProps({ email: 'jake@jake.jake', username: 'jake' })
const jacob = aUserProps({ email: 'jacob@jake.jake', username: 'jacob' })

const buildUseCase = (links: Array<[string, string]> = []) => {
  const users = new InMemoryUserRepository([jake, jacob])
  const follows = new InMemoryFollowRepository(links)
  return { useCase: new FollowUserUseCase(users, follows), follows }
}

describe('REQ-PROFILE-003 — suivre un utilisateur', () => {
  it('AC-1: persiste la relation et renvoie le profil de la cible', async () => {
    const { useCase, follows } = buildUseCase()

    const profile = await useCase.execute({ username: 'jake', followerId: jacob.id })

    expect(profile.username).toBe('jake')
    expect(profile.following).toBe(true)
    expect(await follows.isFollowing(jacob.id, jake.id)).toBe(true)
  })

  it('AC-1: crée une relation orientée, pas réciproque', async () => {
    const { useCase, follows } = buildUseCase()

    await useCase.execute({ username: 'jake', followerId: jacob.id })

    expect(await follows.isFollowing(jake.id, jacob.id)).toBe(false)
  })

  it('AC-2: reste idempotent — suivre deux fois ne crée pas de doublon', async () => {
    const { useCase, follows } = buildUseCase()

    await useCase.execute({ username: 'jake', followerId: jacob.id })
    const second = await useCase.execute({ username: 'jake', followerId: jacob.id })

    expect(second.following).toBe(true)
    expect(follows.size).toBe(1)
  })

  it('AC-2: n’échoue pas quand la relation existe déjà', async () => {
    // Le contrat ne prévoit aucun code d'erreur pour « tu suis déjà » :
    // l'endpoint exprime un état voulu, pas une transition.
    const { useCase } = buildUseCase([[jacob.id, jake.id]])

    await expect(
      useCase.execute({ username: 'jake', followerId: jacob.id })
    ).resolves.toMatchObject({ following: true })
  })

  it('AC-6: refuse une cible qui ne désigne aucun compte', async () => {
    const { useCase, follows } = buildUseCase()

    await expect(
      useCase.execute({ username: 'personne', followerId: jacob.id })
    ).rejects.toBeInstanceOf(UserNotFoundError)

    // Aucune écriture ne doit avoir eu lieu : une implémentation qui écrirait
    // avant de résoudre la cible laisserait une relation orpheline.
    expect(follows.writes).toBe(0)
  })

  it('AC-1: n’expose pas l’email de la cible dans la réponse', async () => {
    const { useCase } = buildUseCase()

    const profile = await useCase.execute({ username: 'jake', followerId: jacob.id })

    expect(JSON.stringify(profile)).not.toContain(jake.email)
  })
})
