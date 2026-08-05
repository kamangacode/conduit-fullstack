import { userResponseSchema } from '@repo/shared'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api-client'

/**
 * Tests écrits **depuis les critères de REQ-WEB-001**, avant l'implémentation.
 *
 * L'ordre compte : un test rédigé d'après le code qu'il teste finit par
 * décrire ce que ce code fait plutôt que ce que l'exigence demande — c'est le
 * défaut consigné dans `artifacts/lessons.md` après la slice F3.
 */

const BASE_URL = 'http://api.test/api'

/** Réponse `fetch` factice : le corps est fourni tel qu'il arriverait sur le réseau. */
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const aUser = {
  user: {
    email: 'jake@jake.jake',
    token: 'jwt.token.here',
    username: 'jake',
    bio: null,
    image: null,
  },
}

const buildClient = (fetchImpl: typeof fetch, token: string | null = null) =>
  createApiClient({ baseUrl: BASE_URL, getToken: () => token, fetchImpl })

describe('REQ-WEB-001 — client API typé par le modèle partagé', () => {
  it('AC-1: rend une réponse conforme au schéma de `@repo/shared`', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, aUser))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    const user = await client.getCurrentUser()

    // Le contrat n'est pas « un objet quelconque » : c'est le schéma que le
    // front et l'API partagent. Valider avec lui prouve que le client ne
    // dégrade rien au passage.
    expect(userResponseSchema.safeParse({ user }).success).toBe(true)
    expect(user.username).toBe('jake')
  })

  it('AC-2: envoie le jeton avec le préfixe `Token`, jamais `Bearer`', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, aUser))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await client.getCurrentUser()

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    // `Bearer` est ce qu'une bibliothèque HTTP configurée par habitude enverrait ;
    // l'API répondrait 401 et le symptôme désignerait l'authentification plutôt
    // que l'en-tête.
    expect(headers.get('authorization')).toBe('Token jwt.token.here')
  })

  it('AC-3: n’envoie aucun en-tête d’autorisation sans jeton', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { profile: {} }))
    const client = buildClient(fetchImpl, null)

    await client.getProfile('jake')

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    expect(headers.has('authorization')).toBe(false)
  })

  it('AC-4: lève une erreur portant le statut et les erreurs par champ', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(422, { errors: { email: ["can't be blank"] } }))
    const client = buildClient(fetchImpl)

    const error = await client
      .login({ email: 'x', password: 'y' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    // Exploitable directement sous un champ de formulaire : c'est la forme que
    // le contrat impose (§10) et que le front de référence affiche.
    expect((error as ApiError).errors).toEqual({ email: ["can't be blank"] })
  })

  it('AC-4: reste exploitable quand le corps d’erreur n’est pas au format §10', async () => {
    // Un 500 d'infrastructure ne porte pas d'enveloppe `errors`. Le client doit
    // quand même lever une ApiError utilisable, pas planter sur le parsing.
    const fetchImpl = vi.fn().mockResolvedValue(new Response('panne', { status: 500 }))
    const client = buildClient(fetchImpl)

    const error = await client.getCurrentUser().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(500)
  })

  it('AC-5: rend la main sur un 204 sans tenter de désérialiser', async () => {
    // `response.json()` sur un corps vide lève une erreur de parsing qui n'a
    // rien à voir avec la requête — et le message envoie déboguer au mauvais
    // endroit.
    //
    // Aucun endpoint de F4 ne répond 204 : le contrat fait renvoyer un
    // `Profile` même au retrait d'un suivi. La garde sert aux suppressions
    // d'article et de commentaire (F5). On l'éprouve donc ici sur la couche de
    // requête, en fabriquant la réponse — et la seule propriété à asserter est
    // qu'elle **ne rejette pas**, puisqu'il n'y a par définition rien à lire.
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await expect(client.unfollowUser('jake')).resolves.not.toThrow()
  })

  // Sans préfixe `AC-n:` : la construction de l'URL n'est le `then:` d'aucun
  // critère de REQ-WEB-001. Le libellé emprunté à AC-2 gonflait la couverture
  // rapportée sans rien prouver de ce que AC-2 demande (l'en-tête `Token`).
  it('construit l’URL sur la base fournie, sans double barre', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, aUser))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await client.getCurrentUser()

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://api.test/api/user')
  })

  // Idem : l'enveloppe du corps sortant est une propriété du contrat §7.1, pas
  // le `then:` de AC-1 (qui porte sur le type des réponses).
  it('enveloppe le corps des requêtes comme le contrat l’exige', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, aUser))
    const client = buildClient(fetchImpl)

    await client.login({ email: 'jake@jake.jake', password: 'jakejake' })

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    // `{ user: … }`, jamais le DTO nu : l'API rejetterait un corps déballé.
    expect(body).toEqual({ user: { email: 'jake@jake.jake', password: 'jakejake' } })
  })
})

/** Tests écrits depuis les critères de REQ-WEB-008, avant l'implémentation. */

const anArticleSummary = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jake', bio: null, image: null, following: false },
}

const anArticle = { ...anArticleSummary, body: 'It takes a Jacobian' }

const aComment = {
  id: 1,
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:22:56.637Z',
  body: 'It takes a Jacobian',
  author: { username: 'jake', bio: null, image: null, following: false },
}

/** URL demandée au n-ième appel, sous une forme assertable. */
const urlOf = (fetchImpl: ReturnType<typeof vi.fn>, call = 0) =>
  new URL(String(fetchImpl.mock.calls[call]?.[0]))

describe('REQ-WEB-008 — client API des articles, commentaires et tags', () => {
  it('AC-1: n’envoie aucun paramètre pour un filtre absent', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { articles: [anArticleSummary], articlesCount: 1 }))
    const client = buildClient(fetchImpl)

    // Les filtres sont passés **explicitement à `undefined`**, et non omis de
    // l'objet : c'est la forme qu'une page produit en lisant ses paramètres
    // d'URL (`{ tag: searchParams.tag }`). Un objet vide ne prouverait rien —
    // il n'a aucune entrée à filtrer, donc le test resterait vert même sans
    // garde, ce qu'un sabotage a effectivement montré.
    await client.listArticles({ tag: undefined, author: undefined, limit: undefined })

    // `?tag=undefined` n'est pas « pas de tag » : côté API c'est un tag nommé
    // « undefined », donc une liste vide, et la page affiche « aucun article »
    // sur un flux qui en contient.
    const url = urlOf(fetchImpl)
    expect(url.pathname).toBe('/api/articles')
    expect(url.search).toBe('')
  })

  it('AC-1: n’envoie rien non plus quand aucun filtre n’est fourni', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { articles: [], articlesCount: 0 }))
    const client = buildClient(fetchImpl)

    await client.listArticles({})

    expect(urlOf(fetchImpl).search).toBe('')
  })

  it('AC-2: place chaque filtre fourni en paramètre, sous le nom du contrat', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { articles: [], articlesCount: 0 }))
    const client = buildClient(fetchImpl)

    await client.listArticles({
      tag: 'dragons',
      author: 'jake',
      favorited: 'jane',
      limit: 10,
      offset: 20,
    })

    const params = urlOf(fetchImpl).searchParams
    expect(params.get('tag')).toBe('dragons')
    expect(params.get('author')).toBe('jake')
    expect(params.get('favorited')).toBe('jane')
    expect(params.get('limit')).toBe('10')
    expect(params.get('offset')).toBe('20')
  })

  it('AC-2: encode un filtre qui contient un caractère réservé', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { articles: [], articlesCount: 0 }))
    const client = buildClient(fetchImpl)

    await client.listArticles({ tag: 'c++ & rust' })

    // Concaténer sans encoder couperait la valeur au `&` et produirait un
    // second paramètre inventé — une requête bien formée au mauvais sens.
    expect(urlOf(fetchImpl).searchParams.get('tag')).toBe('c++ & rust')
  })

  it('AC-3: rend le total annoncé par l’API, pas le nombre d’articles reçus', async () => {
    // Les deux coïncident tant que le jeu tient sous une page : c'est
    // exactement pourquoi ce test pose un total qui ne coïncide pas.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { articles: [anArticleSummary, anArticleSummary], articlesCount: 47 })
      )
    const client = buildClient(fetchImpl)

    const page = await client.listArticles({ limit: 2 })

    expect(page.articles).toHaveLength(2)
    expect(page.articlesCount).toBe(47)
  })

  it('AC-4: demande le flux personnel à son endpoint dédié', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { articles: [], articlesCount: 0 }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await client.getFeed({ limit: 20, offset: 0 })

    // Router le flux personnel vers `/articles` renverrait tout le site :
    // réponse bien formée, contenu entièrement faux.
    expect(urlOf(fetchImpl).pathname).toBe('/api/articles/feed')
  })

  it('AC-5: encode le slug dans le chemin', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { article: anArticle }))
    const client = buildClient(fetchImpl)

    await client.getArticle('a slug/with slash')

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'http://api.test/api/articles/a%20slug%2Fwith%20slash'
    )
  })

  it('AC-6: termine sans erreur sur une suppression qui ne renvoie pas de corps', async () => {
    // Un 204 n'a pas de corps : `response.json()` y lèverait une erreur de
    // parsing sans rapport avec la requête, et l'appelant conclurait à un échec
    // alors que la suppression a réussi.
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await expect(client.deleteArticle('how-to-train-your-dragon')).resolves.toBeUndefined()
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('AC-7: rend l’article renvoyé par l’API après une bascule de favori', async () => {
    const favorited = { ...anArticle, favorited: true, favoritesCount: 1 }
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { article: favorited }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    const article = await client.favoriteArticle('how-to-train-your-dragon')

    expect(article.favorited).toBe(true)
    expect(article.favoritesCount).toBe(1)
    expect(urlOf(fetchImpl).pathname).toBe('/api/articles/how-to-train-your-dragon/favorite')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
  })

  it('AC-7: retire un favori par la même route, en DELETE', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { article: anArticle }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await client.unfavoriteArticle('how-to-train-your-dragon')

    expect(urlOf(fetchImpl).pathname).toBe('/api/articles/how-to-train-your-dragon/favorite')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('AC-8: liste les commentaires d’un article et les déballe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { comments: [aComment] }))
    const client = buildClient(fetchImpl)

    const comments = await client.getComments('how-to-train-your-dragon')

    expect(comments).toHaveLength(1)
    expect(comments[0]?.body).toBe('It takes a Jacobian')
    expect(urlOf(fetchImpl).pathname).toBe('/api/articles/how-to-train-your-dragon/comments')
  })

  it('AC-8: publie un commentaire dans l’enveloppe du contrat', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { comment: aComment }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await client.addComment('how-to-train-your-dragon', { body: 'It takes a Jacobian' })

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({ comment: { body: 'It takes a Jacobian' } })
  })

  it('AC-8: supprime un commentaire par son identifiant, sous l’article', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = buildClient(fetchImpl, 'jwt.token.here')

    await client.deleteComment('how-to-train-your-dragon', 1)

    // Le chemin imbriqué n'est pas décoratif : c'est lui qui permet à l'API de
    // vérifier que le commentaire appartient bien à cet article (motif IDOR).
    expect(urlOf(fetchImpl).pathname).toBe('/api/articles/how-to-train-your-dragon/comments/1')
  })

  it('AC-8: rend la liste des tags, déballée', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { tags: ['dragons', 'training'] }))
    const client = buildClient(fetchImpl)

    const tags = await client.getTags()

    expect(tags).toEqual(['dragons', 'training'])
    expect(urlOf(fetchImpl).pathname).toBe('/api/tags')
  })
})
