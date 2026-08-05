import { afterAll, describe, expect, it } from 'vitest'
import type { Env } from '@/config/env'
import { EmailAlreadyTakenError, UsernameAlreadyTakenError } from '@/domain/user/user.errors'
import { PrismaFollowRepository } from '@/infrastructure/persistence/prisma-follow.repository'
import { PrismaUserRepository } from '@/infrastructure/persistence/prisma-user.repository'
import { PrismaService } from '@/infrastructure/prisma/prisma.service'
import { prismaTestClient } from './setup'

/**
 * Adapters testés contre une **vraie** PostgreSQL (rule 16 : « pas de mock
 * Prisma »).
 *
 * Ce qui se joue ici n'est vérifiable nulle part ailleurs : la traduction d'une
 * violation de contrainte en erreur de domaine suppose que PostgreSQL lève
 * réellement, avec le code et les métadonnées attendus. Un double en mémoire
 * peut simuler ce comportement — c'est ce que fait la lane unit — mais il le
 * simule d'après notre compréhension, pas d'après la base.
 */

// L'environnement est construit ici plutôt que lu par `parseEnv` : la lane
// d'intégration ne pose que `DATABASE_URL`, et exiger `JWT_SECRET` ferait échouer
// ces specs pour une variable dont la persistance n'a que faire.
const env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: process.env.DATABASE_URL as string,
  JWT_SECRET: 'non-utilise-par-la-persistance-32c',
  JWT_EXPIRES_IN: '7d',
} as Env

const prisma = new PrismaService(env)
const users = new PrismaUserRepository(prisma)
const follows = new PrismaFollowRepository(prisma)

afterAll(async () => {
  await prisma.$disconnect()
})

const newUser = (overrides: Partial<{ email: string; username: string }> = {}) => ({
  email: overrides.email ?? 'jake@jake.jake',
  username: overrides.username ?? 'jake',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2VsMDAwMA$condensat',
})

describe('REQ-USER-002 — persistance de l’inscription', () => {
  it('AC-1: crée un compte avec une bio et une image nulles', async () => {
    const created = await users.create(newUser())

    // La migration retire le DEFAULT '' : un compte neuf doit porter NULL, pas
    // une chaîne vide (ADR 004). C'est exactement ce que la colonne aurait
    // renvoyé avant la migration, donc ce test la couvre.
    expect(created.bio).toBeNull()
    expect(created.image).toBeNull()
  })

  it('AC-2: traduit la violation d’unicité sur l’email en erreur de domaine', async () => {
    await users.create(newUser())

    await expect(users.create(newUser({ username: 'autre' }))).rejects.toBeInstanceOf(
      EmailAlreadyTakenError
    )
  })

  it('AC-3: traduit la violation d’unicité sur le username en erreur de domaine', async () => {
    await users.create(newUser())

    await expect(users.create(newUser({ email: 'autre@jake.jake' }))).rejects.toBeInstanceOf(
      UsernameAlreadyTakenError
    )
  })

  it('AC-2: n’insère pas de second compte quand la contrainte a rejeté', async () => {
    await users.create(newUser())
    // Ce second compte n'entre en conflit avec rien : il doit RÉUSSIR, et son
    // insertion est donc attendue sans `catch`. Une version antérieure
    // l'enveloppait dans un `.catch(() => {})` inutile, ce qui donnait à lire que
    // le test exerçait deux rejets là où il n'en exerce qu'un — et aurait masqué
    // une régression rendant cette ligne levante.
    await users.create(newUser({ email: 'autre@jake.jake', username: 'autre' }))

    // Seule celle-ci viole une contrainte (email déjà pris).
    await expect(users.create(newUser({ username: 'troisieme' }))).rejects.toBeInstanceOf(
      EmailAlreadyTakenError
    )

    expect(await prismaTestClient.user.count()).toBe(2)
  })

  it('AC-5: persiste le condensat tel quel, sans le tronquer', async () => {
    const digest = `$argon2id$v=19$m=19456,t=2,p=1$${'a'.repeat(22)}$${'b'.repeat(43)}`
    const created = await users.create({ ...newUser(), passwordHash: digest })

    expect(created.passwordHash).toBe(digest)
  })
})

describe('REQ-USER-004 — persistance de la mise à jour', () => {
  it('AC-3: ne touche qu’aux colonnes fournies', async () => {
    const created = await users.create(newUser())

    const updated = await users.update(created.id, { bio: 'I work at statefarm' })

    expect(updated.bio).toBe('I work at statefarm')
    expect(updated.email).toBe('jake@jake.jake')
    expect(updated.username).toBe('jake')
  })

  it('AC-3: écrit NULL quand la bio est envoyée à null', async () => {
    const created = await users.create(newUser())
    await users.update(created.id, { bio: 'quelque chose' })

    const cleared = await users.update(created.id, { bio: null })

    // La colonne doit accepter NULL : avant la migration, cet UPDATE aurait
    // échoué sur la contrainte NOT NULL.
    expect(cleared.bio).toBeNull()
    expect((await prismaTestClient.user.findUnique({ where: { id: created.id } }))?.bio).toBeNull()
  })

  it('AC-3: distingue une bio effacée d’une bio jamais renseignée', async () => {
    const created = await users.create(newUser())

    const emptied = await users.update(created.id, { bio: '' })

    // `''` et `null` sont deux valeurs distinctes en base : c'est toute la raison
    // d'être de la migration.
    expect(emptied.bio).toBe('')
    expect(emptied.bio).not.toBeNull()
  })

  it('AC-5: traduit un email déjà pris par un autre compte en erreur de domaine', async () => {
    const jake = await users.create(newUser())
    await users.create(newUser({ email: 'jacob@jake.jake', username: 'jacob' }))

    await expect(users.update(jake.id, { email: 'jacob@jake.jake' })).rejects.toBeInstanceOf(
      EmailAlreadyTakenError
    )
  })

  it('AC-6: accepte que le compte resoumette son propre email', async () => {
    const jake = await users.create(newUser())

    // Un UPDATE de la même ligne vers la même valeur ne viole aucune contrainte.
    // Le test existe parce qu'un `findByEmail` « défensif » ajouté plus tard
    // trouverait l'appelant lui-même et casserait ce comportement.
    const updated = await users.update(jake.id, { email: 'jake@jake.jake', username: 'jake' })

    expect(updated.email).toBe('jake@jake.jake')
  })
})

describe('REQ-PROFILE-003 — persistance du suivi', () => {
  const twoUsers = async () => {
    const jake = await users.create(newUser())
    const jacob = await users.create(newUser({ email: 'jacob@jake.jake', username: 'jacob' }))
    return { jake, jacob }
  }

  it('AC-1: persiste une relation orientée', async () => {
    const { jake, jacob } = await twoUsers()

    await follows.follow(jacob.id, jake.id)

    expect(await follows.isFollowing(jacob.id, jake.id)).toBe(true)
    expect(await follows.isFollowing(jake.id, jacob.id)).toBe(false)
  })

  it('AC-2: reste idempotent contre la clé composite réelle', async () => {
    const { jake, jacob } = await twoUsers()

    await follows.follow(jacob.id, jake.id)
    await follows.follow(jacob.id, jake.id)

    // Le point que seule la vraie base peut prouver : un `create` répété aurait
    // levé sur la contrainte de clé primaire composite, là où `upsert` retombe
    // sur une mise à jour vide.
    expect(await prismaTestClient.follow.count()).toBe(1)
  })

  it('AC-3: retire la relation visée sans toucher à la relation inverse', async () => {
    const { jake, jacob } = await twoUsers()
    await follows.follow(jacob.id, jake.id)
    await follows.follow(jake.id, jacob.id)

    await follows.unfollow(jacob.id, jake.id)

    expect(await follows.isFollowing(jacob.id, jake.id)).toBe(false)
    expect(await follows.isFollowing(jake.id, jacob.id)).toBe(true)
  })

  it('AC-4: ne lève pas quand la relation à retirer n’existe pas', async () => {
    const { jake, jacob } = await twoUsers()

    // `deleteMany` et non `delete` : ce dernier lève sur une ligne absente, ce
    // qui transformerait un retrait sans effet en erreur.
    await expect(follows.unfollow(jacob.id, jake.id)).resolves.toBeUndefined()
  })

  it('AC-1: laisse la base supprimer les relations d’un compte effacé', async () => {
    const { jake, jacob } = await twoUsers()
    await follows.follow(jacob.id, jake.id)

    await prismaTestClient.user.delete({ where: { id: jake.id } })

    // `onDelete: Cascade` du schéma : sans lui, la table de suivi garderait des
    // références mortes qu'aucun code applicatif ne nettoierait.
    expect(await prismaTestClient.follow.count()).toBe(0)
  })
})
