import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '@/app.module'
import { applyHttpConventions } from '@/interface/http-conventions'
import { initWithContractHarness } from '../contract/contract-harness'
import { prismaTestClient } from './setup'

/**
 * Idempotence des créations (REQ-IDEM-001, ADR 027).
 *
 * Cette lane est la seule qui puisse en dire quoi que ce soit : la propriété
 * repose sur une **contrainte d'unicité PostgreSQL**, et un test à doublures ne
 * ferait qu'affirmer que notre code appelle ce qu'il croit appeler. La course
 * entre deux requêtes simultanées (AC-4) n'existe qu'ici.
 *
 * Le défaut visé est mesuré, pas supposé : sans clé, deux `POST /articles`
 * identiques créent **deux** articles, le second sur `…-2`, parce que la
 * résolution de slug suffixe sur refus de la contrainte (ADR 010). Le premier
 * test de ce fichier le constate — il documente l'état d'avant, et c'est lui qui
 * donne son sens à tous les autres.
 */

let app: INestApplication
let http: () => ReturnType<typeof request>

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'secret-de-lane-integration-32-car'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  applyHttpConventions(app)
  await initWithContractHarness(app)

  http = () => request(app.getHttpServer())
})

afterAll(async () => {
  await app.close()
})

const register = async (username: string) => {
  const response = await http()
    .post('/api/users')
    .send({ user: { username, email: `${username}@jake.jake`, password: 'jakejake' } })
    .expect(201)

  return response.body.user.token as string
}

const anArticle = (overrides: Record<string, unknown> = {}) => ({
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'You have to believe',
  tagList: ['dragons'],
  ...overrides,
})

/** Publie un article, avec ou sans clé d'idempotence selon `key`. */
const publish = (token: string, key: string | null, overrides: Record<string, unknown> = {}) => {
  const pending = http()
    .post('/api/articles')
    .set('Authorization', `Token ${token}`)
    .send({ article: anArticle(overrides) })

  return key === null ? pending : pending.set('Idempotency-Key', key)
}

describe('REQ-IDEM-001 — l’en-tête est facultatif', () => {
  it('AC-1: sans en-tête, le comportement d’avant est intact — deux envois créent deux articles', async () => {
    const token = await register('jake')

    const first = await publish(token, null).expect(201)
    const second = await publish(token, null).expect(201)

    // Ce test ne décrit pas un comportement souhaitable : il fige l'état
    // d'avant l'item, pour que la valeur des suivants soit lisible. C'est aussi
    // ce que voient les deux suites de conformité vendorées, qui n'envoient
    // jamais cet en-tête — les casser serait rompre le contrat externe.
    expect(first.body.article.slug).toBe('how-to-train-your-dragon')
    expect(second.body.article.slug).toBe('how-to-train-your-dragon-2')

    expect(await prismaTestClient.article.count()).toBe(2)
    expect(await prismaTestClient.idempotencyRecord.count()).toBe(0)
  })
})

describe('REQ-IDEM-001 — le rejeu ressert la réponse d’origine', () => {
  it('AC-2: même clé, même corps : la réponse est identique et aucune seconde ressource n’est créée', async () => {
    const token = await register('jake')

    const first = await publish(token, 'cle-de-publication').expect(201)
    const replay = await publish(token, 'cle-de-publication').expect(201)

    expect(replay.body).toEqual(first.body)
    expect(await prismaTestClient.article.count()).toBe(1)
  })

  it('AC-2: le rejeu ressert l’état d’origine, même si la ressource a changé depuis', async () => {
    const token = await register('jake')

    const first = await publish(token, 'cle-de-publication').expect(201)
    const slug = first.body.article.slug as string

    await http()
      .put(`/api/articles/${slug}`)
      .set('Authorization', `Token ${token}`)
      .send({ article: { title: 'Un titre entièrement différent' } })
      .expect(200)

    const replay = await publish(token, 'cle-de-publication').expect(201)

    // C'est le sens de « rejeu » retenu par l'ADR 027 : même requête, même
    // réponse. Relire l'état courant renverrait une réponse que la requête
    // d'origine n'a jamais produite.
    expect(replay.body).toEqual(first.body)
    expect(replay.body.article.title).toBe('How to train your dragon')
  })

  it('AC-2: la protection vaut aussi pour les commentaires', async () => {
    const token = await register('jake')
    const published = await publish(token, null).expect(201)
    const slug = published.body.article.slug as string

    const post = () =>
      http()
        .post(`/api/articles/${slug}/comments`)
        .set('Authorization', `Token ${token}`)
        .set('Idempotency-Key', 'cle-de-commentaire')
        .send({ comment: { body: 'Bien vu.' } })

    const first = await post().expect(201)
    const replay = await post().expect(201)

    expect(replay.body).toEqual(first.body)
    expect(await prismaTestClient.comment.count()).toBe(1)
  })
})

describe('REQ-IDEM-001 — une clé réutilisée avec un autre corps est un bug client', () => {
  it('AC-3: refuse en 422 et n’exécute pas la création', async () => {
    const token = await register('jake')

    await publish(token, 'cle-de-publication').expect(201)

    const conflicting = await publish(token, 'cle-de-publication', {
      title: 'Un tout autre article',
    }).expect(422)

    expect(conflicting.body.errors).toBeDefined()
    expect(await prismaTestClient.article.count()).toBe(1)
  })
})

describe('REQ-IDEM-001 — la course est tranchée par la base', () => {
  it('AC-4: deux requêtes simultanées sous la même clé ne créent qu’une ressource', async () => {
    const token = await register('jake')

    // Émises sans `await` intermédiaire : les deux partent avant que l'une ait
    // répondu, ce qui est le double-clic réel. Un test séquentiel ne prouverait
    // que le rejeu, pas la course — et c'est la course que la contrainte
    // d'unicité existe pour trancher.
    const [first, second] = await Promise.all([
      publish(token, 'cle-simultanee'),
      publish(token, 'cle-simultanee'),
    ])

    const statuses = [first.status, second.status].sort()

    expect(statuses).toEqual([201, 409])
    expect(await prismaTestClient.article.count()).toBe(1)
  })
})

describe('REQ-IDEM-001 — les clés sont cloisonnées par compte', () => {
  it('AC-5: la clé d’un compte ne donne jamais accès à la réponse d’un autre', async () => {
    const jake = await register('jake')
    const jill = await register('jill')

    const byJake = await publish(jake, 'meme-chaine').expect(201)
    const byJill = await publish(jill, 'meme-chaine').expect(201)

    // Sans le compte dans la contrainte, `jill` recevrait la réponse de `jake` —
    // une fuite de données par simple collision de chaîne.
    expect(byJill.body.article.author.username).toBe('jill')
    expect(byJill.body.article.slug).not.toBe(byJake.body.article.slug)
    expect(await prismaTestClient.article.count()).toBe(2)
  })
})

describe('REQ-IDEM-001 — un échec ne consomme pas la clé', () => {
  it('AC-6: après un refus, la même clé reste rejouable et la requête corrigée aboutit', async () => {
    const token = await register('jake')

    // Corps invalide : le pipe Zod refuse en 422, après que l'intercepteur a
    // déjà réservé la clé.
    await publish(token, 'cle-reprise', { title: '' }).expect(422)

    expect(await prismaTestClient.idempotencyRecord.count()).toBe(0)

    // Sans libération, cette requête recevrait 409 ou le rejeu d'un échec —
    // c'est-à-dire que le mécanisme interdirait la reprise qu'il existe pour
    // permettre.
    const retry = await publish(token, 'cle-reprise').expect(201)

    expect(retry.body.article.slug).toBe('how-to-train-your-dragon')
  })
})

describe('REQ-IDEM-001 — la clé elle-même est validée', () => {
  it('AC-7: refuse une clé vide en 422, sans rien enregistrer', async () => {
    const token = await register('jake')

    await publish(token, '   ').expect(422)

    expect(await prismaTestClient.idempotencyRecord.count()).toBe(0)
    expect(await prismaTestClient.article.count()).toBe(0)
  })

  it('AC-7: refuse une clé trop longue en 422, sans rien enregistrer', async () => {
    const token = await register('jake')

    await publish(token, 'x'.repeat(256)).expect(422)

    expect(await prismaTestClient.idempotencyRecord.count()).toBe(0)
    expect(await prismaTestClient.article.count()).toBe(0)
  })
})
