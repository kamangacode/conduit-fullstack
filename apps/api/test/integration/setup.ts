import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeEach } from 'vitest'
import { drainViolations } from '../contract/contract-harness'

/**
 * Amorçage de la lane d'intégration : garde de sécurité, client Prisma partagé,
 * purge entre les tests.
 *
 * La garde d'abord, parce que c'est elle qui empêche l'accident le plus coûteux
 * de cette lane. Ces tests vident des tables. Si `DATABASE_URL` pointait sur la
 * base de développement — un `.env` chargé par mégarde, une variable restée dans
 * le shell — la suite détruirait les données de travail sans rien signaler
 * d'anormal : elle passerait au vert.
 *
 * D'où un refus catégorique de démarrer si le nom de la base ne contient pas
 * `test`. C'est une convention, pas une preuve formelle, mais elle transforme un
 * accident silencieux en un message explicite avant la première requête.
 */

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL absente. La lane d’intégration se lance via `pnpm test:integration`, ' +
      'qui démarre la base de test et pose la variable.'
  )
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '')

if (!databaseName.includes('test')) {
  throw new Error(
    `Refus de lancer la lane d’intégration sur la base « ${databaseName} » : ` +
      'son nom ne contient pas « test ». Ces specs vident des tables — cette garde ' +
      'existe pour qu’une DATABASE_URL de développement ne soit jamais purgée par erreur.'
  )
}

export const prismaTestClient = new PrismaClient({ datasourceUrl: databaseUrl })

/**
 * Modèles purgés entre deux tests, dans un ordre compatible avec les clés
 * étrangères : les tables porteuses de références d'abord, les tables
 * référencées ensuite.
 *
 * La liste est explicite plutôt que dérivée dynamiquement : `deleteMany()` typé
 * par modèle vaut mieux qu'un `TRUNCATE` en SQL brut, interdit par la rule 19.
 * Le prix — la tenir à jour — est payé par `persistence.integration.spec.ts`,
 * qui échoue si un modèle du schéma Prisma n'y figure pas.
 */
export const TRUNCATED_MODELS = [
  'Favorite',
  'Follow',
  'Comment',
  'Article',
  'IdempotencyRecord',
  'Tag',
  'User',
] as const

export async function truncateAll(): Promise<void> {
  await prismaTestClient.idempotencyRecord.deleteMany()
  await prismaTestClient.favorite.deleteMany()
  await prismaTestClient.follow.deleteMany()
  await prismaTestClient.comment.deleteMany()
  await prismaTestClient.article.deleteMany()
  await prismaTestClient.tag.deleteMany()
  await prismaTestClient.user.deleteMany()
}

// Purge AVANT chaque test plutôt qu'après : si un test échoue en cours de route,
// son état reste inspectable dans la base, et le test suivant part quand même
// d'une table vide. Purger après laisserait le débogage sans données à regarder.
beforeEach(async () => {
  await truncateAll()
})

/**
 * Drainage du harnais de contrat (REQ-ARCH-002, ADR 026).
 *
 * L'intercepteur accumule les écarts au lieu de lever : une exception jetée
 * depuis un intercepteur deviendrait une 500, et le test échouerait sur
 * « attendu 200, reçu 500 » — un diagnostic qui ne nomme jamais la vraie cause.
 * Ce hook les impute au test qui les a provoqués, avec leur motif complet.
 *
 * Il s'applique à **toutes** les specs de la lane, y compris celles qui
 * n'écrivent aucune assertion de contrat : c'est précisément ce qui fait de
 * chacune, en plus de ce qu'elle testait, un test de contrat.
 */
afterEach(() => {
  const violations = drainViolations()
  if (violations.length === 0) return

  throw new Error(
    `Contrat de sortie violé pendant ce test (REQ-ARCH-002) :\n  - ${violations.join('\n  - ')}`
  )
})

afterAll(async () => {
  await prismaTestClient.$disconnect()
})
