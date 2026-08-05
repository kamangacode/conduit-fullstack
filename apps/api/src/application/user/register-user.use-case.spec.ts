import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  FakePasswordHasher,
  FakeTokenService,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { EmailAlreadyTakenError, UsernameAlreadyTakenError } from '../../domain/user/user.errors'
import { RegisterUserUseCase } from './register-user.use-case'

const buildUseCase = (seed = [] as ReturnType<typeof aUserProps>[]) => {
  const users = new InMemoryUserRepository(seed)
  const passwords = new FakePasswordHasher()
  const useCase = new RegisterUserUseCase(users, passwords, new FakeTokenService())
  return { useCase, users, passwords }
}

const validInput = {
  username: 'jacob',
  email: 'jacob@jake.jake',
  password: 'jakejake1',
}

describe('REQ-USER-002 — inscription', () => {
  it('AC-1: crée le compte et renvoie un jeton qui désigne ce compte', async () => {
    const { useCase, users } = buildUseCase()

    const result = await useCase.execute(validInput)

    expect(result.username).toBe('jacob')
    expect(result.email).toBe('jacob@jake.jake')
    expect(users.size).toBe(1)

    // Le jeton doit désigner le compte créé, pas un identifiant quelconque : la
    // doublure encode le sujet en clair précisément pour rendre ça vérifiable.
    const created = await users.findByUsername('jacob')
    expect(result.token).toBe(`token:${created?.id}`)
  })

  it('AC-1: renvoie une bio et une image nulles pour un compte neuf', async () => {
    // ADR 004 : « pas de biographie » se représente par `null`, pas par `""`.
    const { useCase } = buildUseCase()

    const result = await useCase.execute(validInput)

    expect(result.bio).toBeNull()
    expect(result.image).toBeNull()
  })

  it('AC-5: ne stocke jamais le mot de passe en clair', async () => {
    const { useCase, users } = buildUseCase()

    await useCase.execute(validInput)

    const stored = await users.findByUsername('jacob')
    expect(stored?.passwordHash).not.toBe(validInput.password)
    expect(stored?.passwordHash).toBe(`hash:${validInput.password}`)
  })

  it('AC-5: ne laisse pas le mot de passe fuiter dans la réponse', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute(validInput)

    expect(JSON.stringify(result)).not.toContain(validInput.password)
  })

  it('AC-2: refuse un email déjà pris, sans écraser le compte existant', async () => {
    const existing = aUserProps({ email: 'jacob@jake.jake', username: 'autre' })
    const { useCase, users } = buildUseCase([existing])

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(EmailAlreadyTakenError)

    // Le compte existant doit être intact : un `upsert` accidentel passerait
    // l'assertion sur l'erreur mais aurait déjà écrasé la ligne.
    expect(users.size).toBe(1)
    expect(users.snapshot(existing.id)?.username).toBe('autre')
  })

  it('AC-3: refuse un username déjà pris', async () => {
    const { useCase, users } = buildUseCase([
      aUserProps({ email: 'autre@jake.jake', username: 'jacob' }),
    ])

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(UsernameAlreadyTakenError)
    expect(users.size).toBe(1)
  })

  it('AC-2: porte le champ fautif dans le corps d’erreur du contrat', async () => {
    const { useCase } = buildUseCase([aUserProps({ email: 'jacob@jake.jake' })])

    // Le corps §10 est une décision métier portée par l'erreur elle-même : le
    // filtre HTTP n'a plus qu'à choisir le statut.
    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      errorCode: 'conflict',
      response: { errors: { email: ['has already been taken'] } },
    })
  })
})
