'use client'

import type { User } from '@repo/shared'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ApiError, createApiClient } from './api-client'
import { API_BASE_URL } from './env'

/**
 * Session côté client (REQ-WEB-002, REQ-WEB-007, [ADR 012] amendé par [ADR 014]).
 *
 * L'ADR 012 place délibérément la session **hors du serveur** : ni cookie, ni
 * session serveur, un jeton qui ne quitte pas le navigateur. Ce fichier en est
 * la conséquence directe, et sa difficulté tient à un seul point — le rendu
 * serveur ne connaît pas `localStorage`.
 *
 * D'où la règle qui structure tout ce qui suit : **le stockage n'est lu
 * qu'après montage**. Le lire pendant le rendu produirait un arbre différent de
 * celui rendu par le serveur, et React signalerait une divergence
 * d'hydratation — un avertissement qu'on apprend vite à ignorer, et qui masque
 * ensuite les vrais. Le prix est l'état anonyme transitoire que l'ADR assume.
 *
 * L'ADR 014 y ajoute une contrainte externe : le contrat de sélecteurs E2E fixe
 * la clé (`jwtToken`) **et** la valeur (la chaîne JWT, rien d'autre). Le compte
 * courant n'est donc plus persisté — il est redemandé à l'API au démarrage.
 * L'aller-retour a un effet secondaire heureux : le profil affiché ne peut plus
 * être une copie périmée d'un compte modifié ailleurs.
 *
 * Un contexte React et non une bibliothèque d'état : deux valeurs, posées une
 * fois, rarement modifiées. Zustand n'apporterait ici qu'une dépendance
 * (ADR 012, rule 10 amendée).
 */

/**
 * Clé de stockage du jeton.
 *
 * Sa valeur n'est pas un choix interne : le contrat de sélecteurs E2E l'impose
 * (REQ-WEB-007 AC-5). La renommer « pour préfixer comme le reste » casserait la
 * suite Playwright partagée sans rien casser dans l'application.
 */
export const TOKEN_STORAGE_KEY = 'jwtToken'

/**
 * État de résolution de la session.
 *
 * `pending` est la distinction qui manquait et qui a coûté un vrai défaut : au
 * premier rendu, `user === null` signifie **deux choses** — « pas encore résolu »
 * et « anonyme ». Une page qui redirige sur `user === null` éjecte donc les
 * utilisateurs connectés, parce que les effets React se déclenchent des enfants
 * vers les parents : l'effet de la page s'exécute avant celui de ce fournisseur.
 *
 * Depuis l'ADR 014, `pending` n'est plus quasi instantané — il dure le temps
 * d'une requête. La distinction n'est donc plus une précaution : c'est l'état
 * dans lequel une page authentifiée se trouve réellement à chaque chargement.
 *
 * `unavailable` est la seconde distinction du même ordre (REQ-WEB-016) : un
 * jeton conservé mais **invérifiable** n'est pas une absence de session. Sans cet
 * état, une API en rade se lit à l'écran comme une déconnexion, et l'utilisateur
 * se reconnecte pour rien — le formulaire échouera aussi.
 */
export type SessionStatus = 'pending' | 'anonymous' | 'authenticated' | 'unavailable'

/**
 * Une requête relative au lecteur (`following`, `favorited`…) peut-elle partir
 * (REQ-WEB-005 AC-7) ?
 *
 * `pending` est le seul état où l'on ignore encore quel jeton envoyer :
 * `anonymous`, `authenticated` et `unavailable` sont trois réponses, chacune
 * avec un jeton à envoyer ou non déjà tranché. `ArticleView` et `ProfileView`
 * gardaient chacun sa propre copie de ce prédicat — deux endroits qu'un futur
 * cinquième statut aurait dû faire évoluer de concert, sans qu'aucun test ne
 * le rappelle. Exportée pour qu'il n'y en ait plus qu'un.
 */
export function isReaderScopedQueryEnabled(status: SessionStatus): boolean {
  return status !== 'pending'
}

/** Noms d'états du contrat de débogage E2E (REQ-WEB-007 AC-7). */
type DebugAuthState = 'authenticated' | 'unauthenticated' | 'unavailable' | 'loading'

/**
 * Interface de débogage exigée par le contrat de sélecteurs E2E.
 *
 * En **lecture seule** : elle rapporte l'état, elle ne permet pas de l'ouvrir.
 * Une interface qui exposerait `signIn` deviendrait un vecteur ; lire ne donne
 * accès à rien qu'un script de la même origine ne puisse déjà lire dans
 * `localStorage` (ADR 014).
 */
interface ConduitDebug {
  getToken(): string | null
  getAuthState(): DebugAuthState
  getCurrentUser(): User | null
}

declare global {
  interface Window {
    __conduit_debug__?: ConduitDebug
  }
}

/** Traduction vers le vocabulaire du contrat, faite une seule fois, ici. */
const DEBUG_STATES: Record<SessionStatus, DebugAuthState> = {
  pending: 'loading',
  anonymous: 'unauthenticated',
  authenticated: 'authenticated',
  unavailable: 'unavailable',
}

/**
 * Délai entre deux tentatives de réhydratation en mode indisponible
 * (REQ-WEB-016 AC-6).
 *
 * Exporté pour que les tests décrivent la reprise sans attendre réellement cinq
 * secondes — et surtout sans recopier la valeur, ce qui ferait passer une suite
 * verte au premier changement de délai.
 *
 * Cinq secondes : assez long pour ne pas marteler une API déjà en difficulté,
 * assez court pour qu'un utilisateur resté sur la page voie sa session revenir
 * sans penser à recharger.
 */
export const RECONNECT_DELAY_MS = 5_000

/**
 * Délai maximal accordé à la réhydratation avant de la traiter comme une panne
 * (REQ-WEB-016 AC-2, étendu).
 *
 * AC-2 couvre déjà « aucune réponse » quand `fetch` **rejette** sans attendre —
 * panne de transport. Ce qu'il ne couvrait pas est la requête qui ne se termine
 * **jamais**, ni par un succès ni par un rejet : une connexion ouverte que le
 * serveur ne referme pas. Tant que `pending` ne gardait que la barre de
 * navigation (REQ-WEB-016 AC-4), l'écart restait cosmétique. Depuis
 * REQ-WEB-005 AC-7, `pending` retarde aussi `ArticleView` et `ProfileView` —
 * du contenu **public**, sans rapport avec le lecteur — et une requête qui pend
 * l'y bloquerait indéfiniment. La borne referme cet écart en traitant
 * l'absence de réponse comme l'absence de réponse, quelle qu'en soit la cause.
 */
export const REHYDRATION_TIMEOUT_MS = 8_000

interface SessionState {
  /** Compte courant, ou `null` si anonyme **ou** si la session n'est pas encore résolue. */
  readonly user: User | null
  /**
   * Jeton courant, ou `null`.
   *
   * Il survit à `user` dans un seul cas — le mode indisponible, où le jeton est
   * conservé sans que le compte ait pu être résolu (REQ-WEB-016).
   */
  readonly token: string | null
  /**
   * Distingue « pas encore résolu », « anonyme » et « invérifiable ». À
   * interroger avant toute redirection : `user === null` recouvre les trois.
   */
  readonly status: SessionStatus
  /** Ouvre la session à partir de la réponse `User` d'une connexion ou d'une inscription. */
  signIn(user: User): void
  /** Ferme la session et efface le stockage. */
  signOut(): void
}

const SessionContext = createContext<SessionState | null>(null)

/**
 * Relit le jeton persisté.
 *
 * Aucune validation à faire : la valeur est une chaîne opaque, et `apps/web` ne
 * vérifie jamais un JWT — seule l'API fait autorité (rule 10). Un jeton tronqué
 * ou périmé se manifeste par un 401, qui est traité comme tel plus bas.
 */
function readStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || null
}

/**
 * Écrit et efface le jeton — **les deux seuls endroits** qui touchent le
 * stockage.
 *
 * La purge existait en double : `signOut` d'un côté, la branche 401 de la
 * réhydratation de l'autre, chacune avec son propre `removeItem`. Rien ne
 * cassait, mais toute évolution de la politique de purge (invalider le cache de
 * requêtes, émettre un événement, nettoyer une clé de plus) devait être
 * répercutée aux deux endroits, sans que rien ne le rappelle au moment du
 * changement.
 */
function writeStoredToken(token: string): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/**
 * Réhydratation par défaut : `GET /user` avec le jeton conservé.
 *
 * Un client jetable plutôt que celui du fournisseur d'API : c'est ce dernier
 * qui dépend de la session, pas l'inverse. L'inverser produirait un cycle, et
 * le client n'a de toute façon aucun état à partager pour un appel unique —
 * la page de profil procède déjà ainsi côté serveur.
 */
async function fetchCurrentUserWithToken(token: string): Promise<User> {
  const client = createApiClient({ baseUrl: API_BASE_URL, getToken: () => token })
  return client.getCurrentUser()
}

export interface SessionProviderProps {
  readonly children: ReactNode
  /** Injectable pour les tests ; `GET /user` en production. */
  fetchCurrentUser?(token: string): Promise<User>
}

/**
 * Ce que le fournisseur détient : le compte, et où en est sa résolution.
 *
 * Le drapeau `resolved` qui tenait ce rôle ne savait dire que « résolu / pas
 * encore », donc il ne pouvait pas porter un troisième cas — le jeton conservé
 * qu'on n'a pas pu vérifier. Un statut explicite le peut, et il évite surtout de
 * dériver l'état d'une combinaison (`resolved && !user`) que chaque lecteur
 * aurait recalculée à sa façon.
 */
interface SessionSnapshot {
  readonly user: User | null
  readonly status: SessionStatus
  /**
   * Jeton courant.
   *
   * Porté par l'instantané plutôt que dérivé de `user`, parce que le mode
   * indisponible est exactement le cas où les deux divergent : un jeton
   * conservé, aucun compte résolu. Le déduire de `user` rendrait `getToken()`
   * nul là où le contrat de débogage attend la valeur conservée — c'est ce que
   * la suite e2e interroge pour distinguer « conservé » de « purgé ».
   *
   * Il n'est jamais relu depuis le stockage pendant un rendu : chaque
   * transition le pose, ce qui garde la lecture du stockage confinée à l'effet
   * de réhydratation (REQ-WEB-002 AC-5).
   */
  readonly token: string | null
}

/**
 * État de session et ses deux mutations explicites.
 *
 * Chaque mutation incrémente une **génération**. C'est ce compteur qui rend la
 * réhydratation inoffensive quand elle retombe trop tard : voir
 * `useRehydration` ci-dessous.
 */
function useSessionState() {
  // Toujours anonyme et non résolu au premier rendu — donc identique au rendu
  // serveur, qui ne connaît pas le stockage.
  const [session, setSession] = useState<SessionSnapshot>({
    user: null,
    status: 'pending',
    token: null,
  })
  const generation = useRef(0)

  const signIn = useCallback((next: User) => {
    generation.current += 1
    // Le jeton **seul**, en clair : c'est la valeur que le contrat décrit, et
    // c'est aussi la seule donnée du compte qui ait besoin de survivre à la
    // visite (ADR 014).
    writeStoredToken(next.token)
    // Le statut est posé explicitement : sans lui, une connexion survenue
    // pendant une réhydratation en vol laisserait l'état à « pas encore
    // résolu », et toute page qui attend `authenticated` resterait bloquée
    // alors que l'utilisateur vient de s'authentifier.
    setSession({ user: next, status: 'authenticated', token: next.token })
  }, [])

  const signOut = useCallback(() => {
    generation.current += 1
    clearStoredToken()
    setSession({ user: null, status: 'anonymous', token: null })
  }, [])

  return { session, setSession, generation, signIn, signOut }
}

/**
 * Un échec de réhydratation est-il un **verdict sur le jeton** ?
 *
 * La frontière est la classe du statut, et elle est mécanique : l'API a répondu
 * 4xx, donc elle a examiné la requête que ce jeton a permis d'émettre et l'a
 * refusée — 401 parce qu'il est invalide, 403 parce qu'il ne donne pas ce droit,
 * 404 parce que le compte n'existe plus. Aucune de ces réponses ne deviendra
 * vraie en réessayant.
 *
 * Tout le reste — 5xx, absence de réponse, corps illisible — ne dit rien du
 * jeton. Un corps illisible est le cas le plus trompeur : il arrive avec un
 * **200**, donc l'API n'a rien refusé du tout (REQ-WEB-016 AC-3).
 */
function isTokenVerdict(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

/**
 * Réhydrate la session au démarrage, et reprend tant qu'elle reste indisponible
 * (REQ-WEB-002 AC-2, AC-6, AC-7 ; REQ-WEB-016).
 *
 * Extrait du fournisseur pour deux raisons : il dépassait le seuil de la
 * rule 17, et cet effet est la seule partie du fichier qui parle au réseau.
 *
 * **Deux façons pour une réponse d'arriver trop tard**, et une seule ne suffit
 * pas. Le drapeau `cancelled` couvre le démontage. La **génération** couvre le
 * cas plus retors : le fournisseur reste monté pendant toute la navigation App
 * Router, donc un `signIn` ou un `signOut` peut survenir *pendant* que l'appel
 * est en vol. Sans ce compteur, la réponse tardive réappliquerait l'ancien
 * compte et réécrirait l'ancien jeton par-dessus le nouveau — une session
 * fraîchement ouverte disparaîtrait, ou une déconnexion serait ressuscitée,
 * dans les deux cas sans la moindre erreur. La reprise périodique rendrait ce
 * défaut permanent au lieu de fugace : elle est donc soumise au même contrôle,
 * avant chaque nouvelle tentative comme après chaque réponse.
 */
function useRehydration(
  fetchCurrentUser: (token: string) => Promise<User>,
  { setSession, generation }: Pick<ReturnType<typeof useSessionState>, 'setSession' | 'generation'>
) {
  // Lu sans faire dépendre l'effet de la prop : une fonction recréée à chaque
  // rendu par un appelant relancerait sinon l'appel en boucle, et le symptôme
  // serait une avalanche de requêtes `GET /user`.
  const fetchRef = useRef(fetchCurrentUser)
  fetchRef.current = fetchCurrentUser

  useEffect(() => {
    const token = readStoredToken()

    if (!token) {
      // Aucun jeton : inutile d'interroger l'API, elle ne pourrait que refuser.
      // C'est le cas du premier écran d'un visiteur anonyme, celui qu'on ne
      // veut surtout pas ralentir d'un aller-retour.
      setSession({ user: null, status: 'anonymous', token: null })
      return
    }

    return runRehydration({
      token,
      fetchCurrentUser: (current) => fetchRef.current(current),
      setSession,
      generation,
    })
  }, [setSession, generation])
}

/**
 * Borne une promesse dans le temps, sans annuler l'appel sous-jacent.
 *
 * `fetch` n'expose pas de délai par défaut, et ce module n'a aucune raison
 * d'ajouter un `AbortController` au client API partagé pour un seul appelant :
 * la requête réelle peut continuer en arrière-plan, elle sera ignorée si elle
 * répond après coup — exactement ce que `isStale()` fait déjà pour une réponse
 * tardive ordinaire. Rejeter avec une erreur simple (non `ApiError`) suffit :
 * `isTokenVerdict` la classe alors comme la panne qu'elle est.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sans réponse après ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Boucle de réhydratation : une tentative, puis une reprise tant que la session
 * reste indisponible. Rend la fonction d'annulation attendue par `useEffect`.
 *
 * Sortie du hook parce qu'elle ne dépend d'aucun état de React — seulement d'un
 * jeton, d'un moyen d'appeler l'API et d'un moyen de publier le résultat. Le
 * hook garde ainsi la seule chose qui lui revient : décider s'il y a lieu
 * d'appeler.
 */
function runRehydration({
  token,
  fetchCurrentUser,
  setSession,
  generation,
}: {
  token: string
  fetchCurrentUser: (token: string) => Promise<User>
  setSession: ReturnType<typeof useSessionState>['setSession']
  generation: ReturnType<typeof useSessionState>['generation']
}): () => void {
  const startedAt = generation.current
  let cancelled = false
  let retry: ReturnType<typeof setTimeout> | undefined
  /** Démonté, ou doublé par une connexion/déconnexion entre-temps. */
  const isStale = () => cancelled || generation.current !== startedAt

  const onResolved = (current: User): void => {
    if (isStale()) {
      return
    }
    // Le jeton retenu est celui de la **réponse**, pas celui du stockage :
    // l'API est libre d'en émettre un neuf, et conserver l'ancien ferait
    // expirer la session sans raison visible.
    writeStoredToken(current.token)
    setSession({ user: current, status: 'authenticated', token: current.token })
  }

  const onRejected = (error: unknown): void => {
    if (isStale()) {
      return
    }

    if (isTokenVerdict(error)) {
      clearStoredToken()
      setSession({ user: null, status: 'anonymous', token: null })
      return
    }

    // Rien n'est purgé : le jeton reste disponible pour la tentative suivante
    // comme pour un rechargement manuel (REQ-WEB-016 AC-7), et il reste exposé
    // — un outil externe doit pouvoir constater qu'il a été conservé, et une
    // requête cliente n'a aucune raison de partir anonyme alors qu'on en
    // dispose.
    setSession({ user: null, status: 'unavailable', token })
    retry = setTimeout(() => {
      if (!isStale()) {
        attempt()
      }
    }, RECONNECT_DELAY_MS)
  }

  const attempt = (): void => {
    withTimeout(fetchCurrentUser(token), REHYDRATION_TIMEOUT_MS).then(onResolved, onRejected)
  }

  attempt()

  return () => {
    cancelled = true
    clearTimeout(retry)
  }
}

export function SessionProvider({
  children,
  fetchCurrentUser = fetchCurrentUserWithToken,
}: SessionProviderProps) {
  const { session, setSession, generation, signIn, signOut } = useSessionState()
  const { user, status, token } = session

  useRehydration(fetchCurrentUser, { setSession, generation })

  const value = useMemo<SessionState>(
    () => ({ user, token, status, signIn, signOut }),
    [user, token, status, signIn, signOut]
  )

  useDebugInterface(value)

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Publie `window.__conduit_debug__` (REQ-WEB-007 AC-6, ADR 014).
 *
 * L'objet est posé **une seule fois** et lit l'état par référence, plutôt que
 * d'être remplacé à chaque rendu : la suite E2E capture parfois la fonction
 * avant une navigation, et une identité changeante lui ferait lire un état figé.
 *
 * Extrait du fournisseur pour l'y garder lisible : cette interface ne sert
 * qu'aux tests externes, aucun code applicatif ne la consomme.
 */
function useDebugInterface(session: SessionState) {
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    window.__conduit_debug__ = {
      // Le **stockage**, pas l'instantané de session. Les deux coïncident sauf
      // pendant la fenêtre de réhydratation, où la session n'a pas encore résolu
      // son jeton alors qu'il est bien conservé : un outil externe qui interroge
      // à ce moment-là lirait `null` et conclurait à une purge. C'est ce qui
      // rendait instable le test amont qui recharge la page puis lit le jeton —
      // vert ou rouge selon la vitesse du poste.
      getToken: () => readStoredToken(),
      getAuthState: () => DEBUG_STATES[sessionRef.current.status],
      getCurrentUser: () => sessionRef.current.user,
    }

    return () => {
      Reflect.deleteProperty(window, '__conduit_debug__')
    }
  }, [])
}

/**
 * Accès à la session.
 *
 * Le `throw` attrape une erreur de **câblage**, pas une erreur d'utilisateur :
 * un composant client monté hors du fournisseur. Sans lui, la valeur serait
 * `null` et le symptôme apparaîtrait bien plus loin, sous la forme d'une
 * interface obstinément anonyme dont rien n'expliquerait la cause.
 */
export function useSession(): SessionState {
  const session = useContext(SessionContext)

  if (!session) {
    throw new Error(
      'useSession est appelé hors de SessionProvider : le composant doit être rendu ' +
        'sous le fournisseur posé par le layout racine.'
    )
  }

  return session
}
