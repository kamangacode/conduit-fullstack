import { describe, expect, it } from 'vitest'
import {
  aUserProps,
  FakePasswordHasher,
  FakeTokenService,
  InMemoryUserRepository,
} from '../../../test/doubles/auth-doubles'
import { EmailAlreadyTakenError } from '../../domain/user/user.errors'
import { UpdateUserUseCase } from './update-user.use-case'

const jake = aUserProps({
  email: 'jake@jake.jake',
  username: 'jake',
  passwordHash: 'hash:jakejake',
  bio: 'I work at statefarm',
  image: 'https://exemple.test/jake.png',
})
const jacob = aUserProps({ email: 'jacob@jake.jake', username: 'jacob' })

const buildUseCase = (seed = [jake, jacob]) => {
  const users = new InMemoryUserRepository(seed)
  const useCase = new UpdateUserUseCase(users, new FakePasswordHasher(), new FakeTokenService())
  return { useCase, users }
}

describe('REQ-USER-004 — mise à jour du compte courant', () => {
  it('AC-3: ne modifie que le champ fourni', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ userId: jake.id, bio: 'I like to skateboard' })

    expect(result.bio).toBe('I like to skateboard')
    expect(result.email).toBe('jake@jake.jake')
    expect(result.username).toBe('jake')
    expect(result.image).toBe('https://exemple.test/jake.png')
  })

  it('AC-3: laisse le compte intact quand aucun champ n’est fourni', async () => {
    const { useCase, users } = buildUseCase()

    await useCase.execute({ userId: jake.id })

    expect(users.snapshot(jake.id)).toEqual(jake)
  })

  it('AC-3: efface un champ envoyé à null', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.execute({ userId: jake.id, image: null })

    expect(result.image).toBeNull()
  })

  it('AC-3: distingue un champ absent d’un champ à null', async () => {
    // Le cœur du piège : `{ image: null }` efface, `{}` conserve. Une
    // construction des changements qui poserait les clés absentes à `undefined`
    // rendrait les deux appels indiscernables pour le dépôt.
    const cleared = buildUseCase()
    const untouched = buildUseCase()

    const withNull = await cleared.useCase.execute({ userId: jake.id, image: null })
    const withNothing = await untouched.useCase.execute({ userId: jake.id })

    expect(withNull.image).toBeNull()
    expect(withNothing.image).toBe('https://exemple.test/jake.png')
  })

  it('AC-4: remplace le condensat quand un nouveau mot de passe est fourni', async () => {
    const { useCase, users } = buildUseCase()

    await useCase.execute({ userId: jake.id, password: 'nouveau-secret' })

    const stored = users.snapshot(jake.id)
    expect(stored?.passwordHash).toBe('hash:nouveau-secret')
    expect(stored?.passwordHash).not.toBe(jake.passwordHash)
  })

  it('AC-4: ne persiste jamais le mot de passe en clair', async () => {
    const { useCase, users } = buildUseCase()

    await useCase.execute({ userId: jake.id, password: 'nouveau-secret' })

    expect(JSON.stringify(users.snapshot(jake.id))).not.toContain('"nouveau-secret"')
  })

  it('AC-4: ne touche pas au condensat quand aucun mot de passe n’est fourni', async () => {
    const { useCase, users } = buildUseCase()

    await useCase.execute({ userId: jake.id, bio: 'autre chose' })

    expect(users.snapshot(jake.id)?.passwordHash).toBe(jake.passwordHash)
  })

  it('AC-5: refuse un email déjà porté par un autre compte', async () => {
    const { useCase, users } = buildUseCase()

    await expect(
      useCase.execute({ userId: jake.id, email: 'jacob@jake.jake' })
    ).rejects.toBeInstanceOf(EmailAlreadyTakenError)

    expect(users.snapshot(jake.id)?.email).toBe('jake@jake.jake')
  })

  it('AC-6: accepte que l’appelant resoumette son propre email et son propre username', async () => {
    // Le formulaire de réglages du front RealWorld renvoie tout le profil à
    // chaque enregistrement. Un `findByEmail` « défensif » ajouté ici trouverait
    // l'appelant lui-même et lui refuserait sa propre valeur.
    const { useCase } = buildUseCase()

    const result = await useCase.execute({
      userId: jake.id,
      email: 'jake@jake.jake',
      username: 'jake',
    })

    expect(result.email).toBe('jake@jake.jake')
    expect(result.username).toBe('jake')
  })
})
