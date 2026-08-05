import type {
  ErrorResponse,
  LoginDto,
  Profile,
  ProfileResponse,
  RegisterDto,
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
  /** Injectable pour les tests ; `globalThis.fetch` en production. */
  readonly fetchImpl?: typeof fetch
}

interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly path: string
  readonly body?: unknown
}

export interface ApiClient {
  login(dto: LoginDto): Promise<User>
  register(dto: RegisterDto): Promise<User>
  getCurrentUser(): Promise<User>
  updateUser(dto: UpdateUserDto): Promise<User>
  getProfile(username: string): Promise<Profile>
  followUser(username: string): Promise<Profile>
  unfollowUser(username: string): Promise<Profile>
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch
  const baseUrl = config.baseUrl.replace(/\/$/, '')

  async function request<T>({ method, path, body }: RequestOptions): Promise<T> {
    const token = config.getToken()
    const headers = new Headers({ 'content-type': 'application/json' })

    // Préfixe `Token`, singularité de la spec RealWorld (PRD §9) : `Bearer`
    // est ce qu'une bibliothèque HTTP configurée par habitude enverrait, et
    // l'API répondrait 401 sans que rien ne désigne l'en-tête.
    if (token) {
      headers.set('authorization', `Token ${token}`)
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

    if (!response.ok) {
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

  // Regroupés par ressource plutôt qu'énumérés d'un bloc : sept méthodes
  // quasi identiques dans un même littéral se relisent mal, et la frontière
  // `user` / `profile` est celle que le contrat trace déjà (§7.1 et §7.2).
  return { ...userEndpoints(request), ...profileEndpoints(request) }
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
