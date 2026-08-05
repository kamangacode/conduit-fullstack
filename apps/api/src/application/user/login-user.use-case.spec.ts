import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  FakePasswordHasher,
  FakeTokenService,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { InvalidCredentialsError } from '../../domain/user/user.errors'
import { LoginUserUseCase } from './login-user.use-case'

const account = aUserProps({
  email: 'jake@jake.jake',
  username: 'jake',
  passwordHash: 'hash:jakejake',
})

const buildUseCase = () => {
  const users = new InMemoryUserRepository([account])
  const passwords = new FakePasswordHasher()
  const useCase = new LoginUserUseCase(users, passwords, new FakeTokenService())
  return { useCase, users, passwords }
}

/**
 * Capture le rejet d'une promesse pour pouvoir **comparer deux erreurs** entre
 * elles, ce qu'aucun matcher `rejects` ne permet directement.
 *
 * L'assertion d'instance est faite ici : sans elle, une promesse qui résoudrait
 * au lieu de rejeter renverrait `undefined` et les comparaisons qui suivent
 * passeraient en comparant deux `undefined`.
 */
const captureRejection = async (promise: Promise<unknown>): Promise<InvalidCredentialsError> => {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(InvalidCredentialsError)
  return caught as InvalidCredentialsError
}

describe('REQ-USER-003 — connexion', () => {
  it('AC-1: renvoie le compte et un jeton qui le désigne', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ email: 'jake@jake.jake', password: 'jakejake' })

    expect(result.username).toBe('jake')
    expect(result.token).toBe(`token:${account.id}`)
  })

  it('AC-1: ne renvoie jamais le condensat du mot de passe', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ email: 'jake@jake.jake', password: 'jakejake' })

    expect(JSON.stringify(result)).not.toContain(account.passwordHash)
  })

  it('AC-2: refuse un mot de passe erroné', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ email: 'jake@jake.jake', password: 'mauvais' })
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it('AC-3: refuse un email inconnu avec la même erreur qu’un mot de passe erroné', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ email: 'inconnu@jake.jake', password: 'jakejake' })
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it('AC-3: produit un corps d’erreur strictement identique dans les deux cas', async () => {
    const { useCase } = buildUseCase()

    const fromUnknownEmail = await captureRejection(
      useCase.execute({ email: 'inconnu@jake.jake', password: 'jakejake' })
    )
    const fromWrongPassword = await captureRejection(
      useCase.execute({ email: 'jake@jake.jake', password: 'mauvais' })
    )

    // Comparaison du corps ET du code : c'est ce que le client observe, et la
    // moindre différence rétablirait l'oracle d'existence de compte.
    expect(fromUnknownEmail.response).toEqual(fromWrongPassword.response)
    expect(fromUnknownEmail.errorCode).toBe(fromWrongPassword.errorCode)
  })

  it('AC-3: vérifie un mot de passe même quand l’email est inconnu', async () => {
    // La protection que rien dans la réponse ne trahit. Sortir dès l'email
    // inconnu répondrait sans hacher, donc bien plus vite qu'un mot de passe
    // erroné — écart mesurable à distance, qui rouvre l'énumération de comptes
    // que le corps identique vient de fermer.
    //
    // Supprimer le condensat leurre du use-case fait échouer ce test, et lui
    // seul : c'est sa raison d'exister.
    const { useCase, passwords } = buildUseCase()

    await expect(
      useCase.execute({ email: 'inconnu@jake.jake', password: 'jakejake' })
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(passwords.verifyCalls).toBe(1)
  })

  it('AC-3: effectue le même nombre de vérifications dans les deux cas d’échec', async () => {
    const unknownEmail = buildUseCase()
    const wrongPassword = buildUseCase()

    await unknownEmail.useCase
      .execute({ email: 'inconnu@jake.jake', password: 'jakejake' })
      .catch(() => undefined)
    await wrongPassword.useCase
      .execute({ email: 'jake@jake.jake', password: 'mauvais' })
      .catch(() => undefined)

    expect(unknownEmail.passwords.verifyCalls).toBe(wrongPassword.passwords.verifyCalls)
  })

  it('AC-4: n’applique pas la politique de longueur de l’inscription', async () => {
    // Un compte créé avant un durcissement de la politique doit continuer à
    // pouvoir se connecter : un mot de passe court produit un échec
    // d'authentification (401), jamais un refus de validation (422).
    const users = new InMemoryUserRepository([aUserProps({ passwordHash: 'hash:court' })])
    const useCase = new LoginUserUseCase(users, new FakePasswordHasher(), new FakeTokenService())

    const result = await useCase.execute({ email: 'jake@jake.jake', password: 'court' })

    expect(result.username).toBe('jake')
  })
})
