import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  InMemoryFollowRepository,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { UserNotFoundError } from '../../domain/user/user.errors'
import { UnfollowUserUseCase } from './unfollow-user.use-case'

const jake = aUserProps({ email: 'jake@jake.jake', username: 'jake' })
const jacob = aUserProps({ email: 'jacob@jake.jake', username: 'jacob' })

const buildUseCase = (links: Array<[string, string]> = []) => {
  const users = new InMemoryUserRepository([jake, jacob])
  const follows = new InMemoryFollowRepository(links)
  return { useCase: new UnfollowUserUseCase(users, follows), follows }
}

describe('REQ-PROFILE-003 — ne plus suivre un utilisateur', () => {
  it('AC-3: retire la relation et renvoie following à false', async () => {
    const { useCase, follows } = buildUseCase([[jacob.id, jake.id]])

    const profile = await useCase.execute({ username: 'jake', followerId: jacob.id })

    expect(profile.following).toBe(false)
    expect(await follows.isFollowing(jacob.id, jake.id)).toBe(false)
  })

  it('AC-3: ne retire que la relation visée', async () => {
    const { useCase, follows } = buildUseCase([
      [jacob.id, jake.id],
      [jake.id, jacob.id],
    ])

    await useCase.execute({ username: 'jake', followerId: jacob.id })

    // La relation inverse doit survivre : un `delete` écrit sans les deux
    // identifiants dans le bon sens emporterait les deux.
    expect(await follows.isFollowing(jake.id, jacob.id)).toBe(true)
  })

  it('AC-4: reste idempotent — retirer un lien absent n’est pas une erreur', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ username: 'jake', followerId: jacob.id })
    ).resolves.toMatchObject({ following: false })
  })

  it('AC-6: refuse une cible qui ne désigne aucun compte', async () => {
    const { useCase, follows } = buildUseCase()

    await expect(
      useCase.execute({ username: 'personne', followerId: jacob.id })
    ).rejects.toBeInstanceOf(UserNotFoundError)

    expect(follows.writes).toBe(0)
  })
})
