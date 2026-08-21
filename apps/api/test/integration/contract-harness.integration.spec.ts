import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AppModule } from '@/app.module'
import type { ArticleQueryPort } from '@/application/article/ports/article-query.port'
import { ARTICLE_QUERY } from '@/application/article/ports/article-query.port'
import type { ArticleView } from '@/application/article/ports/article-view'
import type { ViewerId } from '@/application/shared/viewer-id'
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
 * Le défaut est donc injecté **dans l'application réelle**, en décorant le port
 * de lecture, et ce test n'écrit aucune assertion de contrat sur la réponse. Il
 * interroge l'endpoint comme n'importe quel test métier, puis constate que le
 * harnais a relevé l'écart tout seul. C'est exactement la propriété visée : la
 * couverture ne dépend plus de ce que le rédacteur a pensé à vérifier.
 *
 * **Ce que l'ADR 031 a changé ici.** Le défaut injecté était un `{ ...row }` qui
 * laissait passer deux colonnes internes, et il affleurait jusqu'au fil parce
 * que le port renvoyait directement la projection du contrat. Ce chemin n'existe
 * plus : `interface/article/article.mapper.ts` énumère les champs, donc une
 * colonne en trop dans le read model ne peut plus sortir. C'est un gain, et le
 * premier test ci-dessous le verrouille au lieu de le laisser tacite.
 *
 * Le harnais garde alors sa raison d'être sur l'autre moitié du risque, celle
 * que le mapper ne ferme pas : un champ **manquant**. Le mapper recopie
 * `undefined`, `JSON.stringify` supprime la clé, et le contrat est violé sans
 * qu'aucun `as` ni aucun `any` n'apparaisse dans le code de production.
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

      // La forme fautive d'avant l'ADR 031 : on recopie l'article de lecture et
      // on laisse passer deux colonnes internes. Aucun `as`, aucun `any`, et le
      // typecheck la valide — c'était tout le problème.
      const internals = { authorId: 'uuid-interne', deletedAt: null }
      return { ...article, ...internals }
    },
  })
}

/**
 * Décore le vrai port pour lui faire **omettre** un champ du contrat.
 *
 * C'est la moitié du risque que le mapper ne ferme pas. Il énumère les champs,
 * donc il ne peut pas en ajouter ; il recopie en revanche ce qu'on lui donne, et
 * `undefined` disparaît à la sérialisation JSON. La réponse part alors sans
 * `title`, avec un 200.
 *
 * Le `as` est ici assumé et circonscrit au test : il simule ce qu'une régression
 * produirait dans une couche que le compilateur ne surveille pas de bout en bout
 * (une projection Prisma dont un `select` perd une colonne, par exemple).
 */
const truncatingArticleQuery = (prisma: PrismaService): ArticleQueryPort => {
  const real = new PrismaArticleQuery(prisma)

  return Object.assign(Object.create(Object.getPrototypeOf(real)) as ArticleQueryPort, real, {
    async findBySlug(slug: Slug, viewer: ViewerId) {
      const article = await real.findBySlug(slug, viewer)
      if (article === null) return null

      const { title: _title, ...withoutTitle } = article
      return withoutTitle as ArticleView
    },
  })
}

let app: INestApplication
let http: () => ReturnType<typeof request>

/**
 * Monte l'application réelle avec un port de lecture décoré.
 *
 * Une application par défaut injecté : monter les deux dans la même instance
 * rendrait indissociable ce que chaque défaut a provoqué, et le harnais
 * accumule ses écarts sans les attribuer.
 */
const bootWith = async (
  factory: (prisma: PrismaService) => ArticleQueryPort
): Promise<INestApplication> => {
  process.env.JWT_SECRET ??= 'secret-de-lane-integration-32-car'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ARTICLE_QUERY)
    .useFactory({ factory, inject: [PrismaService] })
    .compile()

  const booted = moduleRef.createNestApplication()
  applyHttpConventions(booted)
  await initWithContractHarness(booted)
  return booted
}

/** Publie un article et renvoie son slug, en passant par les routes réelles. */
const publishArticle = async (username: string): Promise<string> => {
  const registered = await http()
    .post('/api/users')
    .send({ user: { username, email: `${username}@jake.jake`, password: 'jakejake' } })
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

  return published.body.article.slug as string
}

afterEach(async () => {
  await app?.close()
})

describe('REQ-ARCH-002 — le harnais mord sur l’application réelle', () => {
  it('AC-1: relève un champ manquant, sans qu’aucune assertion de contrat ne soit écrite ici', async () => {
    app = await bootWith(truncatingArticleQuery)
    http = () => request(app.getHttpServer())

    const slug = await publishArticle('jake')

    // Requête ordinaire : le statut est bon, et rien dans ce test ne regarde le
    // contrat.
    await http().get(`/api/articles/${slug}`).expect(200)

    // On draine ici plutôt que de laisser le `afterEach` du setup le faire :
    // le défaut est délibéré, donc c'est ce test qui doit le constater, pas la
    // lane qui doit rougir.
    const violations = drainViolations()

    // **Deux** écarts pour un seul défaut, et c'est le harnais qui l'a appris :
    // la publication ne fabrique pas sa réponse, elle **relit** par le même port
    // (ADR 011). Un défaut posé dans la lecture affleure donc aussi sur
    // l'écriture — relation qu'aucune assertion posée à la main sur `GET`
    // n'aurait montrée.
    expect(violations).toHaveLength(2)
    expect(violations.join('\n')).toContain('POST /api/articles')
    expect(violations.join('\n')).toContain('GET /api/articles/:slug')

    for (const violation of violations) {
      expect(violation).toContain('title')
    }
  })

  it('AC-1: un champ en trop dans le read model ne franchit plus le mapper (ADR 031)', async () => {
    // Avant l'ADR 031, ce même défaut produisait deux violations : le port
    // renvoyait la projection du contrat, et un `{ ...row }` la faisait sortir
    // telle quelle. Le mapper énumère désormais les champs, donc `authorId` et
    // `deletedAt` n'atteignent plus le fil.
    //
    // Ce test ne remplace pas le harnais, il documente ce que le harnais n'a
    // plus à attraper. Le faire échouer demanderait de remettre un spread dans
    // `article.mapper.ts`, ce qui est exactement ce qu'on veut interdire.
    app = await bootWith(leakingArticleQuery)
    http = () => request(app.getHttpServer())

    const slug = await publishArticle('jane')
    const response = await http().get(`/api/articles/${slug}`).expect(200)

    expect(response.body.article).not.toHaveProperty('authorId')
    expect(response.body.article).not.toHaveProperty('deletedAt')
    expect(drainViolations()).toEqual([])
  })

  it('AC-1: laisse passer les réponses conformes de la même application, défaut compris en amont', async () => {
    app = await bootWith(truncatingArticleQuery)
    http = () => request(app.getHttpServer())

    await http()
      .post('/api/users')
      .send({ user: { username: 'jill', email: 'jill@jill.jill', password: 'jilljill' } })
      .expect(201)

    // `GET /api/tags` emprunte un port intact : le harnais ne doit rien relever.
    // Sans ce contrôle, un harnais qui refuserait tout satisferait les tests
    // précédents.
    await http().get('/api/tags').expect(200)

    expect(drainViolations()).toEqual([])
  })
})
