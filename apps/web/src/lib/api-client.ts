import type {
  Article,
  ArticleResponse,
  ArticlesResponse,
  Comment,
  CommentResponse,
  CommentsResponse,
  CreateArticleDto,
  CreateCommentDto,
  ErrorResponse,
  ListArticlesQuery,
  LoginDto,
  PaginationQuery,
  Profile,
  ProfileResponse,
  RegisterDto,
  Tag,
  TagsResponse,
  UpdateArticleDto,
  UpdateUserDto,
  User,
  UserResponse,
} from '@repo/shared'

/**
 * Client HTTP de l'API Conduit.
 *
 * C'est le fichier qui porte la thèse du dépôt : **aucun type Conduit n'est
 * redéfini ici**. Tout ce que ce client accepte et rend vient de
 * `@repo/shared` — le même module que `apps/api` utilise pour produire ces
 * réponses. Il n'y a ni client généré, ni schéma externe à resynchroniser : le
 * compilateur TypeScript est le contrat (architecture §6).
 *
 * La conséquence concrète : ajouter un champ au modèle partagé casse la
 * compilation des deux côtés au même instant. Une `interface Article` recopiée
 * ici ne casserait rien et laisserait le front dériver en silence.
 */

/**
 * Échec d'un appel API, portant ce que le contrat §10 met à disposition.
 *
 * Le client **transporte** l'erreur, il ne l'interprète pas : décider qu'un 422
 * s'affiche sous un champ et qu'un 401 ferme la session est le travail des
 * appelants. Mélanger les deux ferait de ce fichier l'endroit où toute règle
 * d'affichage finirait par atterrir.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: ErrorResponse['errors']
  ) {
    super(`API responded ${status}`)
    this.name = 'ApiError'
  }

  /** Messages aplatis, dans l'ordre d'affichage de la liste `.error-messages`. */
  get messages(): string[] {
    return Object.entries(this.errors).flatMap(([field, messages]) =>
      messages.map((message) => `${field} ${message}`)
    )
  }
}

export interface ApiClientConfig {
  readonly baseUrl: string
  /**
   * Fournisseur de jeton, appelé à **chaque** requête.
   *
   * Une fonction et non une valeur : le jeton change (connexion, déconnexion,
   * expiration) et un client construit avec une valeur figée continuerait
   * d'envoyer l'ancienne après une reconnexion.
   */
  readonly getToken: () => string | null
  /**
   * Notifié quand une requête **authentifiée** revient en 401.
   *
   * C'est une notification, pas une interprétation : le client signale que
   * l'API a rejeté le jeton, et l'appelant décide quoi en faire (purger la
   * session, ici). Sans ce signal, un jeton expiré resterait en place et
   * l'interface continuerait d'affirmer une identité que l'API ne reconnaît
   * plus (REQ-WEB-002 AC-4).
   *
   * Déclenché **uniquement** si un jeton avait été envoyé : un 401 de
   * `POST /users/login` signifie « identifiants refusés », pas « session
   * expirée », et n'a aucune session à purger.
   */
  readonly onUnauthorized?: () => void
  /** Injectable pour les tests ; `globalThis.fetch` en production. */
  readonly fetchImpl?: typeof fetch
}

interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly path: string
  readonly body?: unknown
  /**
   * Filtres de liste. Les entrées `undefined` sont **omises**, pas envoyées à
   * blanc (REQ-WEB-008 AC-1) : `?tag=` désigne le tag vide côté API, donc une
   * liste vide, et la page afficherait « aucun article » sur un flux qui en
   * contient.
   */
  readonly query?: Readonly<Record<string, string | number | undefined>>
}

/**
 * Rend chaque champ facultatif, **`undefined` explicite compris**.
 *
 * `Partial<T>` ne suffit pas ici, et la nuance a coûté un typecheck rouge.
 * Le dépôt active `exactOptionalPropertyTypes` (tsconfig strict maximal, item
 * A8) : sous ce drapeau, `{ limit?: number }` autorise la **clé absente** mais
 * refuse la clé présente valant `undefined`. Or la forme qu'une page produit en
 * lisant ses paramètres d'URL est exactement celle-là —
 * `{ tag: searchParams.tag }`, où `tag` peut être `undefined`.
 *
 * Le drapeau a raison de distinguer les deux cas ; c'est la signature qui devait
 * dire lequel elle accepte, et elle accepte les deux.
 */
type Unset<T> = { [K in keyof T]?: T[K] | undefined }

export interface ApiClient {
  login(dto: LoginDto): Promise<User>
  register(dto: RegisterDto): Promise<User>
  getCurrentUser(): Promise<User>
  updateUser(dto: UpdateUserDto): Promise<User>
  getProfile(username: string): Promise<Profile>
  followUser(username: string): Promise<Profile>
  unfollowUser(username: string): Promise<Profile>
  /**
   * Dérivé du type partagé plutôt que redéclaré : après parse, `limit` et
   * `offset` sont toujours présents (le schéma leur donne une valeur par
   * défaut, règle R-10), alors que l'appelant a le droit de ne rien préciser.
   */
  listArticles(query: Unset<ListArticlesQuery>): Promise<ArticlesResponse>
  getFeed(query: Unset<PaginationQuery>): Promise<ArticlesResponse>
  getArticle(slug: string): Promise<Article>
  createArticle(dto: CreateArticleDto): Promise<Article>
  updateArticle(slug: string, dto: UpdateArticleDto): Promise<Article>
  deleteArticle(slug: string): Promise<void>
  favoriteArticle(slug: string): Promise<Article>
  unfavoriteArticle(slug: string): Promise<Article>
  getComments(slug: string): Promise<Comment[]>
  addComment(slug: string, dto: CreateCommentDto): Promise<Comment>
  deleteComment(slug: string, commentId: number): Promise<void>
  getTags(): Promise<Tag[]>
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch
  const baseUrl = config.baseUrl.replace(/\/$/, '')

  async function request<T>({ method, path, body, query }: RequestOptions): Promise<T> {
    const token = config.getToken()
    const headers = new Headers({ 'content-type': 'application/json' })

    // Préfixe `Token`, singularité de la spec RealWorld (PRD §9) : `Bearer`
    // est ce qu'une bibliothèque HTTP configurée par habitude enverrait, et
    // l'API répondrait 401 sans que rien ne désigne l'en-tête.
    if (token) {
      headers.set('authorization', `Token ${token}`)
    }

    const response = await fetchImpl(`${baseUrl}${path}${toQueryString(query)}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

    if (!response.ok) {
      // Le jeton a été refusé : on signale avant de lever, pour que la session
      // soit purgée même si l'appelant se contente d'afficher l'erreur.
      if (response.status === 401 && token) {
        config.onUnauthorized?.()
      }
      throw await toApiError(response)
    }

    // Un 204 n'a pas de corps : `response.json()` y lèverait une erreur de
    // parsing sans rapport avec la requête (REQ-WEB-001 AC-5). Les endpoints
    // concernés ici ne renvoient rien d'exploitable, d'où l'objet vide.
    if (response.status === 204) {
      return {} as T
    }

    return (await response.json()) as T
  }

  // Regroupés par ressource plutôt qu'énumérés d'un bloc : dix-neuf méthodes
  // quasi identiques dans un même littéral se relisent mal, et la frontière
  // suit celle que le contrat trace déjà (§7.1 à §7.5).
  return {
    ...userEndpoints(request),
    ...profileEndpoints(request),
    ...articleEndpoints(request),
    ...commentEndpoints(request),
    ...tagEndpoints(request),
  }
}

/**
 * Chaîne de requête, **filtres absents omis** (REQ-WEB-008 AC-1).
 *
 * `URLSearchParams` fait l'encodage, y compris des valeurs qui contiennent un
 * `&` ou un `=` — une concaténation manuelle y couperait la valeur et
 * fabriquerait un paramètre supplémentaire, produisant une requête bien formée
 * et de sens différent.
 *
 * Le filtrage porte sur `undefined` seulement : une chaîne vide fournie
 * explicitement est transmise, parce que c'est alors une valeur choisie par
 * l'appelant et non une absence.
 */
function toQueryString(query: RequestOptions['query']): string {
  if (!query) {
    return ''
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Fonction de requête, telle que la referme `createApiClient`. */
type Request = <T>(options: RequestOptions) => Promise<T>

/** Endpoints du compte courant (PRD §7.1). Corps enveloppés `{ user: … }`. */
function userEndpoints(
  request: Request
): Pick<ApiClient, 'login' | 'register' | 'getCurrentUser' | 'updateUser'> {
  const unwrap = async (options: RequestOptions): Promise<User> => {
    const { user } = await request<UserResponse>(options)
    return user
  }

  return {
    login: (dto) => unwrap({ method: 'POST', path: '/users/login', body: { user: dto } }),
    register: (dto) => unwrap({ method: 'POST', path: '/users', body: { user: dto } }),
    getCurrentUser: () => unwrap({ method: 'GET', path: '/user' }),
    updateUser: (dto) => unwrap({ method: 'PUT', path: '/user', body: { user: dto } }),
  }
}

/** Endpoints de profil (PRD §7.2). Le username est encodé : il vient de l'URL. */
function profileEndpoints(
  request: Request
): Pick<ApiClient, 'getProfile' | 'followUser' | 'unfollowUser'> {
  const unwrap = async (options: RequestOptions): Promise<Profile> => {
    const { profile } = await request<ProfileResponse>(options)
    return profile
  }

  const pathFor = (username: string) => `/profiles/${encodeURIComponent(username)}`

  return {
    getProfile: (username) => unwrap({ method: 'GET', path: pathFor(username) }),
    followUser: (username) => unwrap({ method: 'POST', path: `${pathFor(username)}/follow` }),
    unfollowUser: (username) => unwrap({ method: 'DELETE', path: `${pathFor(username)}/follow` }),
  }
}

/** Chemin d'un article. Le slug vient de l'URL ou d'une réponse : il est encodé. */
const articlePath = (slug: string) => `/articles/${encodeURIComponent(slug)}`

/**
 * Chemin de **création** d'article — barre finale comprise, et ce n'est pas une
 * coquille ([ADR 021](../../../../docs/adr/021-chemin-de-creation-d-article-aligne-sur-le-contrat-e2e.md),
 * REQ-WEB-008 AC-10).
 *
 * La suite e2e officielle intercepte `…/api/articles/` pour éprouver la panne de
 * transport à la publication. Un motif Playwright est compilé en expression
 * **ancrée** : la barre y est significative, et un `POST …/api/articles` n'est
 * pas intercepté. La requête partait donc pour de bon, récoltait un 401 sur son
 * jeton factice, et le test échouait sur une page de connexion — un diagnostic
 * qui ne parlait ni du message d'erreur ni de la panne réseau.
 *
 * Ce chemin est donc une **donnée de contrat**, comme un sélecteur (REQ-WEB-007)
 * ou le message d'échec de transport (REQ-WEB-017), et non un détail
 * d'implémentation. Retirer la barre « pour l'aligner sur les autres chemins »
 * ne casserait rien dans l'application et casserait la suite : c'est exactement
 * le mode d'échec que l'ADR 014 documente.
 *
 * Les autres chemins d'article ne portent pas cette barre — seule la création
 * est interceptée sous cette forme. Côté API, les deux écritures sont
 * équivalentes : rien ne change dans `apps/api`.
 */
const CREATE_ARTICLE_PATH = '/articles/'

/**
 * Endpoints d'articles et de favoris (PRD §7.3).
 *
 * Le flux personnel a son **propre chemin** et n'est pas un filtre de la liste
 * globale (REQ-WEB-008 AC-4) : router l'un vers l'autre renverrait tout le site,
 * dans une réponse parfaitement bien formée.
 */
function articleEndpoints(
  request: Request
): Pick<
  ApiClient,
  | 'listArticles'
  | 'getFeed'
  | 'getArticle'
  | 'createArticle'
  | 'updateArticle'
  | 'deleteArticle'
  | 'favoriteArticle'
  | 'unfavoriteArticle'
> {
  const unwrap = async (options: RequestOptions): Promise<Article> => {
    const { article } = await request<ArticleResponse>(options)
    return article
  }

  // L'enveloppe de liste est rendue **telle quelle**, sous le type partagé :
  // `articlesCount` est le total avant pagination, et le recalculer depuis
  // `articles.length` donnerait une valeur juste tant que le jeu tient sous une
  // page — puis fausse, sans erreur (AC-3). Une forme locale
  // `{ articles, articlesCount }` serait de surcroît une redéfinition de
  // `ArticlesResponse`, exactement ce que l'architecture §6 interdit.
  const unwrapPage = (options: RequestOptions): Promise<ArticlesResponse> =>
    request<ArticlesResponse>(options)

  return {
    listArticles: (query) => unwrapPage({ method: 'GET', path: '/articles', query }),
    getFeed: (query) => unwrapPage({ method: 'GET', path: '/articles/feed', query }),
    getArticle: (slug) => unwrap({ method: 'GET', path: articlePath(slug) }),
    createArticle: (dto) =>
      unwrap({ method: 'POST', path: CREATE_ARTICLE_PATH, body: { article: dto } }),
    updateArticle: (slug, dto) =>
      unwrap({ method: 'PUT', path: articlePath(slug), body: { article: dto } }),
    deleteArticle: async (slug) => {
      await request<void>({ method: 'DELETE', path: articlePath(slug) })
    },
    favoriteArticle: (slug) => unwrap({ method: 'POST', path: `${articlePath(slug)}/favorite` }),
    unfavoriteArticle: (slug) =>
      unwrap({ method: 'DELETE', path: `${articlePath(slug)}/favorite` }),
  }
}

/**
 * Endpoints de commentaires (PRD §7.4).
 *
 * Tous passent par le chemin **imbriqué** dans l'article. Ce n'est pas une
 * convention d'esthétique d'URL : c'est ce qui permet à l'API de vérifier que le
 * commentaire appartient bien à cet article avant de le supprimer, contrôle sans
 * lequel un identifiant séquentiel suffirait à supprimer le commentaire d'un
 * autre (motif IDOR, rule 19).
 */
function commentEndpoints(
  request: Request
): Pick<ApiClient, 'getComments' | 'addComment' | 'deleteComment'> {
  const commentsPath = (slug: string) => `${articlePath(slug)}/comments`

  return {
    getComments: async (slug) => {
      const { comments } = await request<CommentsResponse>({
        method: 'GET',
        path: commentsPath(slug),
      })
      return comments
    },
    addComment: async (slug, dto) => {
      const { comment } = await request<CommentResponse>({
        method: 'POST',
        path: commentsPath(slug),
        body: { comment: dto },
      })
      return comment
    },
    deleteComment: async (slug, commentId) => {
      await request<void>({ method: 'DELETE', path: `${commentsPath(slug)}/${commentId}` })
    },
  }
}

/** Tags populaires (PRD §7.5). */
function tagEndpoints(request: Request): Pick<ApiClient, 'getTags'> {
  return {
    getTags: async () => {
      const { tags } = await request<TagsResponse>({ method: 'GET', path: '/tags' })
      return tags
    },
  }
}

/**
 * Construit l'`ApiError` d'une réponse en échec.
 *
 * Le corps n'est pas toujours au format §10 : un 500 d'infrastructure, une
 * passerelle, un timeout renvoient du texte ou rien. Tenter `response.json()`
 * sans filet transformerait alors une panne serveur en erreur de parsing, et le
 * message enverrait déboguer le client au lieu du serveur.
 */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>
    if (body && typeof body === 'object' && body.errors) {
      return new ApiError(response.status, body.errors)
    }
  } catch {
    // Corps illisible : on retombe sur une erreur sans détail par champ.
  }

  return new ApiError(response.status, {})
}
