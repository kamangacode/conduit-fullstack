import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  articleResponseSchema,
  articlesResponseSchema,
  CONTRACT_MESSAGES,
  commentResponseSchema,
  commentsResponseSchema,
  tagsResponseSchema,
} from '@repo/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '@/app.module'
import { applyHttpConventions } from '@/interface/http-conventions'
import { initWithContractHarness } from '../contract/contract-harness'

/**
 * Le contrat HTTP de la slice F3, de bout en bout : application NestJS réelle,
 * base réelle, aucun mock.
 *
 * Ce niveau prouve ce dont aucun autre ne peut rien dire : les **statuts**, les
 * **enveloppes**, la traduction des erreurs de domaine par le filtre, le
 * comportement des **guards**, et l'**ordre des routes** — `GET /feed` doit
 * précéder `GET /:slug`, sinon le flux est capté comme un slug et répond 404.
 *
 * Les réponses sont validées contre les schémas de `packages/shared` : ce qui
 * passe ici est exactement ce que le front saura lire.
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

/** Inscrit un compte et rend son jeton. La base est purgée entre chaque test. */
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
  tagList: ['dragons', 'training'],
  ...overrides,
})

const publish = async (token: string, overrides: Record<string, unknown> = {}) => {
  const response = await http()
    .post('/api/articles')
    .set('Authorization', `Token ${token}`)
    .send({ article: anArticle(overrides) })
    .expect(201)

  return response.body.article.slug as string
}

describe('REQ-ARTICLE-003 — POST /articles', () => {
  it('AC-1: répond 201 avec l’enveloppe article du contrat', async () => {
    const token = await register('jake')

    const response = await http()
      .post('/api/articles')
      .set('Authorization', `Token ${token}`)
      .send({ article: anArticle() })
      .expect(201)

    expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.article.author.username).toBe('jake')
    expect(response.body.article.favoritesCount).toBe(0)
  })

  it('AC-6: répond 401 sans jeton', async () => {
    await http().post('/api/articles').send({ article: anArticle() }).expect(401)
  })

  it('AC-7: répond 422 au format §10 sur un champ vide', async () => {
    const token = await register('jake')

    const response = await http()
      .post('/api/articles')
      .set('Authorization', `Token ${token}`)
      .send({ article: anArticle({ title: '   ' }) })
      .expect(422)

    // Clés d'erreur déballées (`title`), jamais préfixées par l'enveloppe.
    expect(response.body.errors).toHaveProperty('title')
  })

  it('AC-4: ignore un auteur soufflé dans le corps', async () => {
    const token = await register('jake')
    await register('jacob')

    const response = await http()
      .post('/api/articles')
      .set('Authorization', `Token ${token}`)
      .send({ article: { ...anArticle(), author: 'jacob', slug: 'choisi-par-le-client' } })
      .expect(201)

    expect(response.body.article.author.username).toBe('jake')
    expect(response.body.article.slug).toBe('how-to-train-your-dragon')
  })

  it('accepte la barre finale que `apps/web` émet en création (ADR 021)', async () => {
    // `CREATE_ARTICLE_PATH` (`apps/web/src/lib/api-client.ts`) émet
    // `POST /articles/`, et non `/articles`, pour que la suite e2e officielle
    // puisse intercepter la requête. L'ADR 021 affirme que le routeur d'Express
    // répond identiquement aux deux formes hors *strict routing* — une
    // affirmation sur **notre** câblage NestJS, pas sur Express en général, que
    // rien ne vérifiait ici. Sans ce test, un jour où `strict routing` serait
    // activé (ou un intercepteur de préfixe ajouté) casserait silencieusement
    // la création d'article depuis le front, découvert uniquement en e2e.
    const token = await register('jake')

    const response = await http()
      .post('/api/articles/')
      .set('Authorization', `Token ${token}`)
      .send({ article: anArticle() })
      .expect(201)

    expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.article.slug).toBe('how-to-train-your-dragon')
  })
})

describe('REQ-ARTICLE-004 — GET /articles/:slug', () => {
  it('AC-1: répond 200 à un anonyme, body inclus', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    const response = await http().get(`/api/articles/${slug}`).expect(200)

    expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.article.body).toBe('You have to believe')
  })

  it('AC-3: répond 404 sur un slug inconnu', async () => {
    await http().get('/api/articles/jamais-ecrit').expect(404)
  })
})

describe('REQ-ARTICLE-005 — PUT /articles/:slug', () => {
  it('AC-2: régénère le slug quand le titre change', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    const response = await http()
      .put(`/api/articles/${slug}`)
      .set('Authorization', `Token ${token}`)
      .send({ article: { title: 'Did you train your dragon?' } })
      .expect(200)

    expect(response.body.article.slug).toBe('did-you-train-your-dragon')
    // L'ancienne URL cesse de répondre (ADR 010, Consequences).
    await http().get(`/api/articles/${slug}`).expect(404)
  })

  it('AC-4: répond 403 quand l’article appartient à un autre', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    await http()
      .put(`/api/articles/${slug}`)
      .set('Authorization', `Token ${jacob}`)
      .send({ article: { title: 'Détourné' } })
      .expect(403)
  })

  it('AC-5: répond 404 sur un slug inconnu', async () => {
    const token = await register('jake')

    await http()
      .put('/api/articles/jamais-ecrit')
      .set('Authorization', `Token ${token}`)
      .send({ article: { title: 'x' } })
      .expect(404)
  })

  it('AC-7: répond 422 quand la modification vide un champ requis', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http()
      .put(`/api/articles/${slug}`)
      .set('Authorization', `Token ${token}`)
      .send({ article: { title: '   ' } })
      .expect(422)

    // L'article reste dans son état antérieur.
    const unchanged = await http().get(`/api/articles/${slug}`).expect(200)
    expect(unchanged.body.article.title).toBe('How to train your dragon')
  })

  it('AC-6: répond 401 sans jeton, sans révéler si le slug existe', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http()
      .put(`/api/articles/${slug}`)
      .send({ article: { title: 'x' } })
      .expect(401)
    await http()
      .put('/api/articles/jamais-ecrit')
      .send({ article: { title: 'x' } })
      .expect(401)
  })
})

describe('REQ-ARTICLE-006 — DELETE /articles/:slug', () => {
  it('AC-1: répond 204 sans corps', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    const response = await http()
      .delete(`/api/articles/${slug}`)
      .set('Authorization', `Token ${token}`)
      .expect(204)

    expect(response.body).toEqual({})
    await http().get(`/api/articles/${slug}`).expect(404)
  })

  it('AC-3: répond 403 quand l’article appartient à un autre', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    await http().delete(`/api/articles/${slug}`).set('Authorization', `Token ${jacob}`).expect(403)
  })

  it('AC-5: répond 401 sans jeton, et l’article subsiste', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http().delete(`/api/articles/${slug}`).expect(401)

    await http().get(`/api/articles/${slug}`).expect(200)
  })
})

describe('REQ-ARTICLE-007 — GET /articles', () => {
  it('AC-1: répond 200 avec l’enveloppe de liste', async () => {
    const token = await register('jake')
    await publish(token)

    const response = await http().get('/api/articles').expect(200)

    expect(articlesResponseSchema.safeParse(response.body).success).toBe(true)
  })

  it('AC-2: omet le body des articles listés (R-7)', async () => {
    const token = await register('jake')
    await publish(token)

    const response = await http().get('/api/articles').expect(200)

    expect(response.body.articles[0]).not.toHaveProperty('body')
  })

  it('AC-3: applique les défauts de pagination sans query (R-10)', async () => {
    const token = await register('jake')
    await publish(token)

    const response = await http().get('/api/articles').expect(200)

    expect(response.body.articlesCount).toBe(1)
  })

  it('AC-4: filtre par tag', async () => {
    const token = await register('jake')
    await publish(token, { title: 'Avec dragons', tagList: ['dragons'] })
    await publish(token, { title: 'Avec react', tagList: ['reactjs'] })

    const response = await http().get('/api/articles?tag=dragons').expect(200)

    expect(response.body.articlesCount).toBe(1)
    expect(response.body.articles[0].title).toBe('Avec dragons')
  })

  it('AC-1: refuse une pagination invalide en 422', async () => {
    await http().get('/api/articles?limit=zero').expect(422)
  })
})

describe('REQ-ARTICLE-008 — GET /articles/feed', () => {
  it('AC-3: répond 401 sans jeton', async () => {
    // Et non 404 : c'est la preuve que la route `/feed` est bien déclarée avant
    // `/:slug`. Si l'ordre était inversé, « feed » serait lu comme un slug, la
    // route à authentification optionnelle répondrait, et ce test verrait 404.
    await http().get('/api/articles/feed').expect(401)
  })

  it('AC-1: ne renvoie que les articles des auteurs suivis', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    await publish(jake)
    await http()
      .post('/api/profiles/jake/follow')
      .set('Authorization', `Token ${jacob}`)
      .expect(200)

    const response = await http()
      .get('/api/articles/feed')
      .set('Authorization', `Token ${jacob}`)
      .expect(200)

    expect(articlesResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.articlesCount).toBe(1)
    expect(response.body.articles[0].author.following).toBe(true)
  })

  it('AC-2: exclut les articles du lecteur lui-même', async () => {
    const jacob = await register('jacob')
    await publish(jacob)

    const response = await http()
      .get('/api/articles/feed')
      .set('Authorization', `Token ${jacob}`)
      .expect(200)

    expect(response.body.articlesCount).toBe(0)
  })
})

describe('REQ-ARTICLE-009 — favoris', () => {
  it('AC-1: POST /favorite répond 200 et incrémente le compteur', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    const response = await http()
      .post(`/api/articles/${slug}/favorite`)
      .set('Authorization', `Token ${jacob}`)
      .expect(200)

    expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.article.favorited).toBe(true)
    expect(response.body.article.favoritesCount).toBe(1)
  })

  it('AC-2: favoriser deux fois reste 200 sans doubler le compteur', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    await http()
      .post(`/api/articles/${slug}/favorite`)
      .set('Authorization', `Token ${jacob}`)
      .expect(200)
    const second = await http()
      .post(`/api/articles/${slug}/favorite`)
      .set('Authorization', `Token ${jacob}`)
      .expect(200)

    expect(second.body.article.favoritesCount).toBe(1)
  })

  it('AC-4: défavoriser ce qui ne l’était pas reste 200', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    const response = await http()
      .delete(`/api/articles/${slug}/favorite`)
      .set('Authorization', `Token ${jacob}`)
      .expect(200)

    expect(response.body.article.favoritesCount).toBe(0)
  })

  it('AC-6: répond 401 sans jeton', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http().post(`/api/articles/${slug}/favorite`).expect(401)
  })

  it('AC-7: répond 404 sur un slug inconnu', async () => {
    const token = await register('jake')

    await http()
      .post('/api/articles/jamais-ecrit/favorite')
      .set('Authorization', `Token ${token}`)
      .expect(404)
  })
})

describe('REQ-COMMENT-002 — POST /articles/:slug/comments', () => {
  it('AC-1: répond 201 avec l’enveloppe comment', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    const response = await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${jacob}`)
      .send({ comment: { body: 'His name was my name too.' } })
      .expect(201)

    expect(commentResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.comment.author.username).toBe('jacob')
  })

  it('AC-2: l’identifiant sérialisé est un nombre, pas une chaîne', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    const response = await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: 'un' } })
      .expect(201)

    // Le contrat déclare `id` en `type: integer` et le montre sérialisé en
    // nombre (ADR 004). Un UUID passerait le schéma d'enveloppe mais casserait
    // la suite de conformité.
    expect(typeof response.body.comment.id).toBe('number')
  })

  it('AC-3: ignore un auteur et un identifiant soufflés dans le corps', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    const response = await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${jacob}`)
      .send({ comment: { body: 'un', author: 'jake', id: 4242 } })
      .expect(201)

    // Le DTO ne porte qu'un `body` : passer le corps tel quel à la persistance
    // semblerait inoffensif et permettrait de commenter au nom d'un autre.
    expect(response.body.comment.author.username).toBe('jacob')
    expect(response.body.comment.id).not.toBe(4242)
  })

  it('AC-4: répond 422 sur un corps vide', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: '  ' } })
      .expect(422)
  })

  it('AC-5: répond 401 sans jeton', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http()
      .post(`/api/articles/${slug}/comments`)
      .send({ comment: { body: 'un' } })
      .expect(401)
  })

  it('AC-6: répond 404 sur un slug inconnu', async () => {
    const token = await register('jake')

    await http()
      .post('/api/articles/jamais-ecrit/comments')
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: 'un' } })
      .expect(404)
  })
})

describe('REQ-COMMENT-003 — GET /articles/:slug/comments', () => {
  it('AC-1: répond 200 avec une enveloppe sans compteur', async () => {
    const token = await register('jake')
    const slug = await publish(token)
    await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: 'un' } })
      .expect(201)

    const response = await http().get(`/api/articles/${slug}/comments`).expect(200)

    expect(commentsResponseSchema.safeParse(response.body).success).toBe(true)
    expect(Object.keys(response.body)).toEqual(['comments'])
  })

  it('AC-2: répond 200 et liste vide sur un article sans commentaire', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    const response = await http().get(`/api/articles/${slug}/comments`).expect(200)

    expect(response.body.comments).toEqual([])
  })

  it('AC-4: répond 404 sur un article inconnu', async () => {
    await http().get('/api/articles/jamais-ecrit/comments').expect(404)
  })

  it('AC-5: n’expose de l’auteur que username, bio, image et following', async () => {
    const token = await register('jake')
    const slug = await publish(token)
    await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: 'un' } })
      .expect(201)

    const response = await http().get(`/api/articles/${slug}/comments`).expect(200)

    // Assertion sur les clés RÉELLEMENT présentes : vérifier la présence des
    // quatre attendues passerait aussi avec un email en trop.
    expect(Object.keys(response.body.comments[0].author).sort()).toEqual([
      'bio',
      'following',
      'image',
      'username',
    ])
    expect(JSON.stringify(response.body)).not.toContain('jake@jake.jake')
  })
})

describe('REQ-COMMENT-004 — DELETE /articles/:slug/comments/:id', () => {
  const postComment = async (token: string, slug: string) => {
    const response = await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: 'un' } })
      .expect(201)
    return response.body.comment.id as number
  }

  it('AC-1: répond 204 sans corps', async () => {
    const token = await register('jake')
    const slug = await publish(token)
    const id = await postComment(token, slug)

    await http()
      .delete(`/api/articles/${slug}/comments/${id}`)
      .set('Authorization', `Token ${token}`)
      .expect(204)

    const remaining = await http().get(`/api/articles/${slug}/comments`).expect(200)
    expect(remaining.body.comments).toEqual([])
  })

  it('AC-2: répond 403 quand le commentaire est celui d’un autre', async () => {
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)
    const id = await postComment(jacob, slug)

    await http()
      .delete(`/api/articles/${slug}/comments/${id}`)
      .set('Authorization', `Token ${jake}`)
      .expect(403)
  })

  it('AC-3: répond 404 sur un identifiant inconnu', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    await http()
      .delete(`/api/articles/${slug}/comments/999999`)
      .set('Authorization', `Token ${token}`)
      .expect(404)
  })

  it('AC-5: répond 401 sans jeton, et le commentaire subsiste', async () => {
    const token = await register('jake')
    const slug = await publish(token)
    const id = await postComment(token, slug)

    await http().delete(`/api/articles/${slug}/comments/${id}`).expect(401)

    const remaining = await http().get(`/api/articles/${slug}/comments`).expect(200)
    expect(remaining.body.comments).toHaveLength(1)
  })

  it('AC-3: répond 422 sur un identifiant non entier', async () => {
    const token = await register('jake')
    const slug = await publish(token)

    // 422 et non 400 : ce dernier ne figure pas dans les codes du contrat.
    await http()
      .delete(`/api/articles/${slug}/comments/abc`)
      .set('Authorization', `Token ${token}`)
      .expect(422)
  })
})

describe('REQ-TAG-002 — GET /tags', () => {
  it('AC-1: répond 200 avec l’enveloppe tags, sans authentification', async () => {
    const token = await register('jake')
    await publish(token, { tagList: ['dragons', 'training'] })

    const response = await http().get('/api/tags').expect(200)

    expect(tagsResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.tags).toEqual(['dragons', 'training'])
  })

  it('AC-3: répond 200 et liste vide quand rien n’est publié', async () => {
    const response = await http().get('/api/tags').expect(200)

    expect(response.body.tags).toEqual([])
  })
})

describe('REQ-ERROR-002 — messages d’erreur exigés par la suite de conformité', () => {
  it('AC-6: dit « forbidden » pour un article comme pour un commentaire', async () => {
    // Le contrat emploie **le même** message pour les deux ressources, sous des
    // clés différentes. Nos libellés d'origine étaient distincts (« is not yours
    // to modify » / « … to delete ») : plus explicites, et hors contrat.
    const jake = await register('jake')
    const jacob = await register('jacob')
    const slug = await publish(jake)

    const updated = await http()
      .put(`/api/articles/${slug}`)
      .set('Authorization', `Token ${jacob}`)
      .send({ article: { body: 'détourné' } })
      .expect(403)
    expect(updated.body).toEqual({ errors: { article: [CONTRACT_MESSAGES.forbidden] } })

    const deleted = await http()
      .delete(`/api/articles/${slug}`)
      .set('Authorization', `Token ${jacob}`)
      .expect(403)
    expect(deleted.body).toEqual({ errors: { article: [CONTRACT_MESSAGES.forbidden] } })

    const comment = await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${jake}`)
      .send({ comment: { body: 'le commentaire de jake' } })
      .expect(201)

    const refused = await http()
      .delete(`/api/articles/${slug}/comments/${comment.body.comment.id}`)
      .set('Authorization', `Token ${jacob}`)
      .expect(403)
    expect(refused.body).toEqual({ errors: { comment: [CONTRACT_MESSAGES.forbidden] } })
  })

  it('AC-1: rend « can’t be blank » sur les champs d’un article et d’un commentaire', async () => {
    const token = await register('jake')

    const article = await http()
      .post('/api/articles')
      .set('Authorization', `Token ${token}`)
      .send({
        article: { title: '', description: 'Ever wonder how?', body: 'You have to believe' },
      })
      .expect(422)
    expect(article.body.errors.title[0]).toBe(CONTRACT_MESSAGES.blank)

    const slug = await publish(token)
    const comment = await http()
      .post(`/api/articles/${slug}/comments`)
      .set('Authorization', `Token ${token}`)
      .send({ comment: { body: '' } })
      .expect(422)
    expect(comment.body.errors.body[0]).toBe(CONTRACT_MESSAGES.blank)
  })

  it('AC-3: dit « is missing » sur les routes d’écriture d’articles et de commentaires', async () => {
    const token = await register('jake')
    const slug = await publish(token)
    const expected = { errors: { token: [CONTRACT_MESSAGES.tokenMissing] } }

    // Les six routes que la suite officielle interroge sans jeton. Les balayer
    // ensemble plutôt qu'une seule : le guard est posé route par route, et un
    // oubli sur une seule d'entre elles ne se verrait sur aucune des autres.
    expect(
      (await http().post('/api/articles').send({ article: anArticle() }).expect(401)).body
    ).toEqual(expected)
    expect(
      (await http().put(`/api/articles/${slug}`).send({ article: {} }).expect(401)).body
    ).toEqual(expected)
    expect((await http().delete(`/api/articles/${slug}`).expect(401)).body).toEqual(expected)
    expect((await http().get('/api/articles/feed').expect(401)).body).toEqual(expected)
    expect((await http().post(`/api/articles/${slug}/favorite`).expect(401)).body).toEqual(expected)
    expect(
      (
        await http()
          .post(`/api/articles/${slug}/comments`)
          .send({ comment: { body: 'x' } })
          .expect(401)
      ).body
    ).toEqual(expected)
  })
})
