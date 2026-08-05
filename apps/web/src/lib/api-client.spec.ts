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
