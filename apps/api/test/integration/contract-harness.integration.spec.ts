import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '@/app.module'
import type { ArticleQueryPort, ViewerId } from '@/domain/article/ports/article-query.port'
import { ARTICLE_QUERY } from '@/domain/article/ports/article-query.port'
import type { Slug } from '@/domain/article/slug'
import { PrismaArticleQuery } from '@/infrastructure/persistence/prisma-article.query'
import { PrismaService } from '@/infrastructure/prisma/prisma.service'
import { applyHttpConventions } from '@/interface/http-conventions'
import { drainViolations, initWithContractHarness } from '../contract/contract-harness'

/**
 * Le harnais de contrat, éprouvé **sur l'application réelle** (REQ-ARCH-002 AC-1).
 *
 * `test/contract/contract-harness.spec.ts` prouve que l'assertion refuse ce
 * qu'elle doit refuser ; il ne prouve rien du câblage. Un harnais correct mais
 * monté nulle part laisserait la lane entièrement verte — et c'est le mode
 * d'échec le plus coûteux, parce qu'un faux vert ne se voit jamais : personne
 * ne va vérifier qu'un garde-fou refuse (leçon du 2026-08-08 sur le fail-fast
 * d'environnement).
 *
 * La fuite est donc injectée **là où elle se produirait vraiment** : dans le
 * port de lecture, sous la forme exacte qu'un adapter écrit quand il va vite —
 * un spread de la ligne de persistance. Rappel de la mesure qui fonde l'ADR
 * 026 : `tsc` refuse un champ nommé en trop dans un littéral, mais accepte
 * `{ ...row }` où `row` est plus large que le contrat. Le compilateur ne voit
 * donc pas cette fuite, et aucun des 151 tests de la lane ne la verrait non
 * plus sans le harnais.
 *
 * **Ce test n'écrit aucune assertion de contrat sur la réponse.** Il interroge
 * l'endpoint comme n'importe quel test métier, puis constate que le harnais a
 * relevé l'écart tout seul. C'est exactement la propriété visée : la couverture
 * ne dépend plus de ce que le rédacteur a pensé à vérifier.
 */

/**
 * Décore le vrai port de lecture pour lui faire rendre deux champs hors contrat.
 *
 * On délègue à `PrismaArticleQuery` plutôt que de fabriquer un article de
 * toutes pièces : une doublure prouverait que le harnais réagit à un objet
 * inventé, pas qu'il réagit à ce que la persistance produit réellement.
 */
const leakingArticleQuery = (prisma: PrismaService): ArticleQueryPort => {
  const real = new PrismaArticleQuery(prisma)

  return Object.assign(Object.create(Object.getPrototypeOf(real)) as ArticleQueryPort, real, {
    async findBySlug(slug: Slug, viewer: ViewerId) {
      const article = await real.findBySlug(slug, viewer)
      if (article === null) return null

      // La forme fautive : on recopie l'article et on laisse passer deux
      // colonnes internes. Aucun `as`, aucun `any` — et le typecheck la
      // valide, ce qui est tout le problème.
      const internals = { authorId: 'uuid-interne', deletedAt: null }
      return { ...article, ...internals }
    },
  })
}

let app: INestApplication
let http: () => ReturnType<typeof request>

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'secret-de-lane-integration-32-car'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ARTICLE_QUERY)
    .useFactory({ factory: leakingArticleQuery, inject: [PrismaService] })
    .compile()

  app = moduleRef.createNestApplication()
  applyHttpConventions(app)
  await initWithContractHarness(app)

  http = () => request(app.getHttpServer())
})

afterAll(async () => {
  await app.close()
})

describe('REQ-ARCH-002 — le harnais mord sur l’application réelle', () => {
  it('AC-1: relève une fuite introduite par le port de lecture, sans qu’aucune assertion de contrat ne soit écrite ici', async () => {
    const registered = await http()
      .post('/api/users')
      .send({ user: { username: 'jake', email: 'jake@jake.jake', password: 'jakejake' } })
      .expect(201)

    const token = registered.body.user.token as string

    const published = await http()
      .post('/api/articles')
      .set('Authorization', `Token ${token}`)
      .send({
        article: {
          title: 'How to train your dragon',
          description: 'Ever wonder how?',
          body: 'You have to believe',
          tagList: ['dragons'],
        },
      })
      .expect(201)

    const slug = published.body.article.slug as string

    // Requête ordinaire : le statut est bon, le corps porte tous les champs
    // attendus, et rien dans ce test ne regarde le contrat.
    await http().get(`/api/articles/${slug}`).expect(200)

    // On draine ici plutôt que de laisser le `afterEach` du setup le faire :
    // la fuite est délibérée, donc c'est ce test qui doit la constater, pas la
    // lane qui doit rougir.
    const violations = drainViolations()

    // **Deux** écarts pour une seule fuite, et c'est le harnais qui l'a appris :
    // la publication ne fabrique pas sa réponse, elle **relit** par le même port
    // (parti pris de F3, pour ne pas dupliquer la projection). Un défaut posé
    // dans la lecture affleure donc aussi sur l'écriture — relation qu'aucune
    // assertion posée à la main sur `GET` n'aurait montrée.
    expect(violations).toHaveLength(2)
    expect(violations.join('\n')).toContain('POST /api/articles')
    expect(violations.join('\n')).toContain('GET /api/articles/:slug')

    for (const violation of violations) {
      expect(violation).toContain('article.authorId')
      expect(violation).toContain('article.deletedAt')
    }
  })

  it('AC-1: laisse passer les réponses conformes de la même application, fuite comprise en amont', async () => {
    await http()
      .post('/api/users')
      .send({ user: { username: 'jill', email: 'jill@jill.jill', password: 'jilljill' } })
      .expect(201)

    // `GET /api/tags` emprunte un port intact : le harnais ne doit rien relever.
    // Sans ce contrôle, un harnais qui refuserait tout satisferait le test
    // précédent.
    await http().get('/api/tags').expect(200)

    expect(drainViolations()).toEqual([])
  })
})
