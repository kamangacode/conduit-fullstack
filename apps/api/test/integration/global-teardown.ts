import { PrismaClient } from '@prisma/client'

/**
 * Purge de fin de run (rule 15 : la base de test est vidée « même en cas
 * d'échec »).
 *
 * `globalTeardown` s'exécute après la suite, que les tests soient passés ou non
 * — c'est ce qui distingue cette purge du `beforeEach` de `setup.ts` : ce
 * dernier garantit l'isolation *entre* les tests, celle-ci garantit qu'aucun
 * run ne laisse la base peuplée derrière lui.
 *
 * Elle ne réutilise pas le client de `setup.ts` : les fichiers de setup vivent
 * dans le contexte des workers de test, le teardown global dans celui du
 * runner. Partager l'instance donnerait un client déjà déconnecté.
 */
export default async function teardown(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!(databaseUrl && new URL(databaseUrl).pathname.includes('test'))) {
    // Même garde que `setup.ts` : on ne purge jamais une base dont le nom
    // n'annonce pas qu'elle est jetable.
    return
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  try {
    await prisma.favorite.deleteMany()
    await prisma.follow.deleteMany()
    await prisma.comment.deleteMany()
    await prisma.article.deleteMany()
    await prisma.tag.deleteMany()
    await prisma.user.deleteMany()
  } finally {
    await prisma.$disconnect()
  }
}
