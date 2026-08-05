import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  FakeTokenService,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { AuthenticatedUserNotFoundError } from '../../domain/user/user.errors'
import { GetCurrentUserUseCase } from './get-current-user.use-case'

// DEUX comptes en base, délibérément. Avec un seul, une implémentation qui
// renverrait « le premier utilisateur venu » passerait toutes les assertions —
// c'est le test tautologique typique sur une lecture par identité.
const jake = aUserProps({ email: 'jake@jake.jake', username: 'jake' })
const jacob = aUserProps({ email: 'jacob@jake.jake', username: 'jacob' })

const buildUseCase = () => {
  const users = new InMemoryUserRepository([jake, jacob])
  return { useCase: new GetCurrentUserUseCase(users, new FakeTokenService()), users }
}

describe('REQ-USER-004 — lecture du compte courant', () => {
  it('AC-1: renvoie le compte désigné par le jeton, et non un autre', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ userId: jacob.id })

    expect(result.username).toBe('jacob')
    expect(result.email).toBe('jacob@jake.jake')
  })

  it('AC-1: renvoie l’autre compte pour l’autre identité', async () => {
    // Le pendant du test précédent : à eux deux, ils prouvent que la réponse
    // suit l'identité passée plutôt qu'un ordre d'insertion.
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ userId: jake.id })

    expect(result.username).toBe('jake')
  })

  it('AC-1: porte un jeton dans la réponse', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ userId: jake.id })

    expect(result.token).toBe(`token:${jake.id}`)
  })

  it('AC-2: refuse une identité qui ne se résout plus en compte', async () => {
    // REQ-AUTH-001 AC-6 : un jeton parfaitement signé peut désigner un compte
    // supprimé depuis.
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ userId: '00000000-0000-4000-8000-999999999999' })
    ).rejects.toBeInstanceOf(AuthenticatedUserNotFoundError)
  })

  it('AC-2: porte le code 401 et le corps du refus d’authentification', async () => {
    // L'assertion de type seule ne suffisait pas : c'est le `errorCode` qui
    // décide du statut HTTP, et une erreur `not_found` produirait un 404 doublé
    // d'un `errors.profile` — donc un oracle d'existence de compte. Ce test rend
    // impossible de revenir en arrière sans le voir.
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ userId: '00000000-0000-4000-8000-999999999999' })
    ).rejects.toMatchObject({
      errorCode: 'unauthorized',
      response: { errors: { authorization: ['is invalid or missing'] } },
    })
  })
})
