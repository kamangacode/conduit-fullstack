import {
  articleResponseSchema,
  articlesResponseSchema,
  commentResponseSchema,
  commentsResponseSchema,
  profileResponseSchema,
  tagsResponseSchema,
  userResponseSchema,
} from '@repo/shared'
import { describe, expect, it, vi } from 'vitest'
import type { ZodType } from 'zod'
import { type ApiClient, createApiClient } from './api-client'

/**
 * Le déballage de l'enveloppe, éprouvé dans les deux directions
 * (REQ-ARCH-002 AC-8, ADR 026).
 *
 * Côté API, le harnais de contrat prouve que ce qui part sur le fil est
 * exactement ce que le schéma décrit. Il ne dit rien de ce qui se passe **après
 * le fil** : le client web ne parse pas — il transtype le JSON, puis déballe
 * l'enveloppe (`const { user } = …`). Ce déballage est le seul endroit du front
 * où un champ peut disparaître ou apparaître sans que le compilateur bronche —
 * un `.map()` posé là un jour de refactoring, et l'écran affiche des valeurs
 * vides sans qu'aucune erreur ne remonte.
 *
 * D'où deux assertions par cas, et la seconde est celle qui compte :
 *
 *   1. le corps servi satisfait le schéma partagé **symétriquement**
 *      (`parse(body)` égal à `body`), donc il ne décrit pas une réponse
 *      imaginaire — sans quoi tout le reste porterait sur une fiction ;
 *   2. ce que le client rend est **exactement** le contenu de l'enveloppe :
 *      aucun champ perdu, aucun champ inventé.
 *
 * Pourquoi aucune fixture capturée depuis l'API réelle, contrairement à ce que
 * l'ADR 026 annonçait d'abord : une vraie réponse porte un jeton signé, deux
 * horodatages et un identifiant de commentaire qui monte à chaque exécution.
 * La figer demanderait de nommer les champs volatils, c'est-à-dire une seconde
 * description du modèle — précisément ce que cet ADR refuse par ailleurs. Le
 * second temps de l'ADR 026 porte cette décision et ce qu'elle laisse ouvert.
 */

const BASE_URL = 'http://api.test/api'

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const buildClient = (body: unknown): ApiClient =>
  createApiClient({
    baseUrl: BASE_URL,
    getToken: () => 'jwt.token.here',
    fetchImpl: vi.fn().mockResolvedValue(jsonResponse(body)),
  })

/**
 * Les valeurs sont **hostiles à la normalisation**, et ce n'est pas de la
 * coquetterie : le premier écrit de cette spec portait `username: 'jake'`, et un
 * sabotage qui ajoutait `.toLowerCase()` au déballage du profil ne la faisait pas
 * rougir — une valeur déjà normalisée ne peut pas révéler une normalisation.
 *
 * Chaque forme choisie ici vise donc un geste précis, et un seul :
 *   - la casse mélangée attrape un `.toLowerCase()` / `.toUpperCase()` ;
 *   - l'espace final du commentaire attrape un `.trim()` (les schémas de
 *     **réponse** ne trimment pas — seuls les DTO d'entrée le font, cf.
 *     `contract-fields.ts` — donc l'espace survit au parse et l'égalité tient) ;
 *   - les listes en ordre non alphabétique attrapent un `.sort()` ;
 *   - `bio` et `image` à `null` attrapent un `?? ''`, la « commodité » la plus
 *     tentante du front, qui transformerait une absence en valeur vide.
 */
const aProfile = { username: 'Jake-The-Trainer', bio: null, image: null, following: false }

const anArticle = {
  slug: 'how-to-train-your-dragon',
  title: 'How To Train Your Dragon',
  description: 'Ever Wonder How?',
  body: 'You have to believe',
  tagList: ['training', 'dragons'],
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  favorited: false,
  favoritesCount: 3,
  author: aProfile,
}

const { body: _body, ...aSummary } = anArticle

const aComment = {
  id: 1,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  // Espace final délibéré — voir la note ci-dessus.
  body: 'Bien Vu. ',
  author: aProfile,
}

const anEnvelopedUser = {
  user: {
    email: 'jake@jake.jake',
    token: 'jwt.token.here',
    username: 'Jake-The-Trainer',
    bio: null,
    image: null,
  },
}

/**
 * Un cas = une enveloppe servie sur le fil, le schéma qui la décrit, la méthode
 * appelée, et ce que l'appelant doit récupérer.
 *
 * Table plutôt qu'une suite de tests recopiés : dix-huit méthodes déballent la
 * même façon, et un cas oublié se verrait mieux dans une liste que dans deux
 * cents lignes qui se ressemblent.
 */
const CASES: ReadonlyArray<{
  readonly label: string
  readonly envelope: Record<string, unknown>
  readonly schema: ZodType
  readonly call: (client: ApiClient) => Promise<unknown>
  readonly expected: unknown
}> = [
  {
    label: 'login',
    envelope: anEnvelopedUser,
    schema: userResponseSchema,
    call: (client) => client.login({ email: 'jake@jake.jake', password: 'jakejake' }),
    expected: anEnvelopedUser.user,
  },
  {
    label: 'register',
    envelope: anEnvelopedUser,
    schema: userResponseSchema,
    call: (client) =>
      client.register({ username: 'jake', email: 'jake@jake.jake', password: 'jakejake' }),
    expected: anEnvelopedUser.user,
  },
  {
    label: 'getCurrentUser',
    envelope: anEnvelopedUser,
    schema: userResponseSchema,
    call: (client) => client.getCurrentUser(),
    expected: anEnvelopedUser.user,
  },
  {
    label: 'updateUser',
    envelope: anEnvelopedUser,
    schema: userResponseSchema,
    call: (client) => client.updateUser({ bio: 'Dragon trainer' }),
    expected: anEnvelopedUser.user,
  },
  {
    label: 'getProfile',
    envelope: { profile: aProfile },
    schema: profileResponseSchema,
    call: (client) => client.getProfile('jake'),
    expected: aProfile,
  },
  {
    label: 'followUser',
    envelope: { profile: aProfile },
    schema: profileResponseSchema,
    call: (client) => client.followUser('jake'),
    expected: aProfile,
  },
  {
    label: 'unfollowUser',
    envelope: { profile: aProfile },
    schema: profileResponseSchema,
    call: (client) => client.unfollowUser('jake'),
    expected: aProfile,
  },
  {
    label: 'getArticle',
    envelope: { article: anArticle },
    schema: articleResponseSchema,
    call: (client) => client.getArticle('how-to-train-your-dragon'),
    expected: anArticle,
  },
  {
    label: 'createArticle',
    envelope: { article: anArticle },
    schema: articleResponseSchema,
    call: (client) =>
      client.createArticle({
        title: 'How to train your dragon',
        description: 'Ever wonder how?',
        body: 'You have to believe',
        tagList: ['dragons', 'training'],
      }),
    expected: anArticle,
  },
  {
    label: 'updateArticle',
    envelope: { article: anArticle },
    schema: articleResponseSchema,
    call: (client) => client.updateArticle('how-to-train-your-dragon', { title: 'Nouveau titre' }),
    expected: anArticle,
  },
  {
    label: 'favoriteArticle',
    envelope: { article: anArticle },
    schema: articleResponseSchema,
    call: (client) => client.favoriteArticle('how-to-train-your-dragon'),
    expected: anArticle,
  },
  {
    label: 'unfavoriteArticle',
    envelope: { article: anArticle },
    schema: articleResponseSchema,
    call: (client) => client.unfavoriteArticle('how-to-train-your-dragon'),
    expected: anArticle,
  },
  {
    // Seul cas qui ne déballe rien : `articlesCount` est le total AVANT
    // pagination, et le recalculer depuis `articles.length` donnerait une
    // valeur juste tant que le jeu tient sous une page, puis fausse en silence.
    label: 'listArticles',
    envelope: { articles: [aSummary], articlesCount: 41 },
    schema: articlesResponseSchema,
    call: (client) => client.listArticles({ limit: 20, offset: 0 }),
    expected: { articles: [aSummary], articlesCount: 41 },
  },
  {
    label: 'getFeed',
    envelope: { articles: [aSummary], articlesCount: 41 },
    schema: articlesResponseSchema,
    call: (client) => client.getFeed({ limit: 20, offset: 0 }),
    expected: { articles: [aSummary], articlesCount: 41 },
  },
  {
    label: 'getComments',
    envelope: { comments: [aComment] },
    schema: commentsResponseSchema,
    call: (client) => client.getComments('how-to-train-your-dragon'),
    expected: [aComment],
  },
  {
    label: 'addComment',
    envelope: { comment: aComment },
    schema: commentResponseSchema,
    call: (client) => client.addComment('how-to-train-your-dragon', { body: 'Bien vu.' }),
    expected: aComment,
  },
  {
    label: 'getTags',
    envelope: { tags: ['dragons', 'training'] },
    schema: tagsResponseSchema,
    call: (client) => client.getTags(),
    expected: ['dragons', 'training'],
  },
]

describe('REQ-ARCH-002 — le déballage du client web ne perd ni n’invente de champ', () => {
  for (const { label, envelope, schema, call, expected } of CASES) {
    it(`AC-8: ${label} rend exactement ce que l’enveloppe contenait`, async () => {
      // L'enveloppe servie doit d'abord être une vraie réponse du contrat, et
      // pas seulement une qui « passe » : `parse` retire les clés inconnues,
      // donc l'égalité avec la source est la preuve qu'il n'y en avait aucune.
      expect(schema.parse(envelope)).toEqual(envelope)

      expect(await call(buildClient(envelope))).toEqual(expected)
    })
  }

  it('AC-8: la table couvre toutes les méthodes du client qui rendent une valeur', () => {
    // Les suppressions ne rendent rien : aucune enveloppe à déballer, donc rien
    // à couvrir ici. Elles sont **nommées** plutôt qu'écartées par un filtre sur
    // le préfixe `delete`, sans quoi une méthode future s'exclurait toute seule
    // du contrôle par le seul choix de son nom.
    const noBody: readonly string[] = ['deleteArticle', 'deleteComment']

    const client = createApiClient({
      baseUrl: BASE_URL,
      getToken: () => null,
      fetchImpl: vi.fn(),
    })
    const returning = Object.keys(client)
      .filter((name) => !noBody.includes(name))
      .sort()

    // Comparaison des **noms**, pas des effectifs : deux listes de même longueur
    // peuvent parfaitement ne pas décrire les mêmes méthodes. Sans cette
    // assertion, ajouter une méthode au client la laisserait hors de la table
    // sans qu'aucun test ne rougisse — le même angle mort que les douze
    // assertions posées à la main côté API, transposé au front.
    expect([...new Set(CASES.map(({ label }) => label))].sort()).toEqual(returning)
  })
})
