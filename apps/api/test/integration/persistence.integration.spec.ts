import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { prismaTestClient, TRUNCATED_MODELS } from './setup'

/**
 * Vérification active de la lane d'intégration.
 *
 * Ce n'est pas encore un test de l'application — les adapters Prisma arrivent
 * avec les slices de la Phase F. C'est la preuve que la plomberie sur laquelle
 * ils s'appuieront fonctionne : base démarrée, migrations appliquées, écriture
 * et lecture réelles, isolation entre tests.
 *
 * Sans cette preuve, le premier adapter écrit contre cette lane devrait
 * diagnostiquer en même temps son propre code et la chaîne qui l'exécute.
 */
describe('lane d’intégration — plomberie de persistance', () => {
  it('applique les migrations : le schéma attendu existe', async () => {
    // Une base vide répondrait aussi à un `SELECT 1`. On interroge donc une
    // table du schéma : c'est ce qui distingue « Postgres répond » de
    // « les migrations Prisma ont bien été appliquées ».
    const count = await prismaTestClient.user.count()

    expect(count).toBe(0)
  })

  it('écrit et relit une ligne réelle', async () => {
    const created = await prismaTestClient.user.create({
      data: {
        email: 'sonde@conduit.test',
        username: 'sonde',
        passwordHash: 'hash-non-significatif',
      },
    })

    const reloaded = await prismaTestClient.user.findUniqueOrThrow({ where: { id: created.id } })

    expect(reloaded.email).toBe('sonde@conduit.test')
    // `bio` a un @default("") côté schéma : le relire prouve que la valeur par
    // défaut vient bien de la base, pas d'une supposition du client.
    expect(reloaded.bio).toBe('')
    expect(reloaded.createdAt).toBeInstanceOf(Date)
  })

  it('fait respecter les contraintes du schéma, pas seulement celles du code', async () => {
    await prismaTestClient.user.create({
      data: { email: 'doublon@conduit.test', username: 'doublon', passwordHash: 'hash' },
    })

    // L'unicité de l'email est une contrainte SQL. C'est exactement le genre de
    // règle qu'un mock de Prisma n'applique pas — et donc la raison pour
    // laquelle cette lane existe (rule 16 : pas de mock Prisma).
    await expect(
      prismaTestClient.user.create({
        data: { email: 'doublon@conduit.test', username: 'autre', passwordHash: 'hash' },
      })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
  })

  it('part d’une base vide à chaque test (isolation)', async () => {
    // Le test précédent a créé des utilisateurs. S'ils étaient encore là, la
    // purge du `beforeEach` ne fonctionnerait pas — et les suites suivantes
    // échoueraient selon leur ordre d'exécution, symptôme coûteux à diagnostiquer.
    expect(await prismaTestClient.user.count()).toBe(0)
  })

  it('purge tous les modèles du schéma Prisma', () => {
    // Garde de maintenance : le jour où un modèle est ajouté au schéma sans être
    // ajouté à `truncateAll()`, ses lignes survivraient d'un test à l'autre.
    // Cette assertion transforme cet oubli silencieux en échec immédiat.
    const schemaModels = Prisma.dmmf.datamodel.models.map((model) => model.name).sort()

    expect(schemaModels).toEqual([...TRUNCATED_MODELS].sort())
  })
})
