import type { User } from '@repo/shared'
import { act, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api-client'
import {
  RECONNECT_DELAY_MS,
  REHYDRATION_TIMEOUT_MS,
  SessionProvider,
  TOKEN_STORAGE_KEY,
  useSession,
} from './session'

/** Tests écrits depuis les critères de REQ-WEB-002, REQ-WEB-007 et REQ-WEB-016. */

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

/**
 * Réhydratation injectée.
 *
 * Le fournisseur appelle l'API au démarrage (ADR 014) : sans injection, chaque
 * test dépendrait du réseau. La doublure permet surtout de décrire les trois
 * réponses qui comptent — succès, jeton refusé, API muette — que `fetch`
 * mocké globalement rendrait beaucoup moins lisibles.
 */
const fetchCurrentUser = vi.fn<(token: string) => Promise<User>>()

/** Sonde : expose l'état de session dans le DOM pour l'asserter. */
function SessionProbe() {
  const { user, token, status, signIn, signOut } = useSession()

  return (
    <div>
      <span data-testid="username">{user?.username ?? 'anonyme'}</span>
      <span data-testid="token">{token ?? 'aucun'}</span>
      <span data-testid="status">{status}</span>
      <button type="button" onClick={() => signIn(jake)}>
        connexion
      </button>
      <button type="button" onClick={signOut}>
        déconnexion
      </button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <SessionProvider fetchCurrentUser={fetchCurrentUser}>
      <SessionProbe />
    </SessionProvider>
  )

beforeEach(() => {
  window.localStorage.clear()
  fetchCurrentUser.mockReset().mockResolvedValue(jake)
  Reflect.deleteProperty(window, '__conduit_debug__')
})

describe('REQ-WEB-002 — session cliente', () => {
  it('AC-1: ouvre la session et la rend disponible sans rechargement', async () => {
    renderProbe()

    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })

    expect(screen.getByTestId('username')).toHaveTextContent('jake')
    expect(screen.getByTestId('token')).toHaveTextContent('jwt.token.here')
  })

  it('AC-1: persiste le jeton pour la prochaine visite', async () => {
    renderProbe()

    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })

    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt.token.here')
  })

  it('AC-2: redemande le compte à l’API au démarrage, avec le jeton conservé', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')

    renderProbe()

    // La lecture a lieu après montage : l'état est anonyme au premier rendu,
    // puis bascule. `waitFor` décrit exactement cette séquence.
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('jake'))
    expect(fetchCurrentUser).toHaveBeenCalledWith('jwt.token.here')
  })

  it('AC-2: n’appelle pas l’API quand aucun jeton n’est conservé', async () => {
    // Sans cette garde, chaque visite anonyme paie un aller-retour qui ne peut
    // que répondre 401 — et le premier écran d'un visiteur non connecté est
    // précisément celui qu'on ne veut pas ralentir.
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(fetchCurrentUser).not.toHaveBeenCalled()
  })

  it('AC-5: rend l’état anonyme côté serveur, où le stockage n’existe pas', () => {
    // Le piège que ce critère ferme : lire `localStorage` pendant le rendu
    // produit un arbre différent de celui rendu par le serveur, et React
    // signale une divergence d'hydratation — un avertissement qu'on apprend à
    // ignorer, et qui masque ensuite les vrais.
    //
    // Le rendu serveur est donc la seule façon honnête de l'éprouver : monter
    // le composant avec Testing Library ne le montrerait pas, puisqu'elle
    // exécute les effets aussitôt. On rend donc en chaîne, **sans** stockage —
    // exactement les conditions de Node.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    const storage = window.localStorage
    Reflect.deleteProperty(window, 'localStorage')

    try {
      const html = renderToString(
        <SessionProvider fetchCurrentUser={fetchCurrentUser}>
          <SessionProbe />
        </SessionProvider>
      )

      // Ni exception, ni fuite de la session persistée dans le HTML initial.
      expect(html).toContain('anonyme')
      expect(html).not.toContain('jake')
    } finally {
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    }
  })

  it('AC-3: ferme la session et efface le stockage', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('jake'))

    await act(async () => {
      screen.getByRole('button', { name: 'déconnexion' }).click()
    })

    expect(screen.getByTestId('username')).toHaveTextContent('anonyme')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('AC-6: purge un jeton que l’API refuse', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jeton.perime')
    fetchCurrentUser.mockRejectedValue(new ApiError(401, {}))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    // Un jeton refusé qui reste en place fait réessayer à chaque visite, et
    // l'interface affiche une barre connectée que chaque action dément.
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('AC-6: purge aussi sur les autres verdicts 4xx', async () => {
    // Un 400, un 403 ou un 404 sur `GET /user` ne disent pas la même chose
    // qu'un 401, mais ils disent tous que **cette requête-là**, émise avec ce
    // jeton, n'aboutira pas. Le garder ferait réessayer indéfiniment un jeton
    // qu'aucune de ces réponses ne validera jamais.
    for (const status of [400, 403, 404]) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jeton.refuse')
      fetchCurrentUser.mockReset().mockRejectedValue(new ApiError(status, {}))

      const { unmount } = renderProbe()

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
      unmount()
    }
  })

  it('AC-7: conserve le jeton quand l’API est injoignable', async () => {
    // La distinction qui compte : un 4xx est une réponse d'autorité, une panne
    // réseau n'en est pas une. Purger sur ce second signal transformerait une
    // coupure de trente secondes en déconnexion de tous les visiteurs.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    fetchCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt.token.here')
  })

  it('AC-7: ne purge pas non plus sur une panne serveur', async () => {
    // Un 500 n'est pas davantage un verdict sur le jeton qu'une coupure réseau.
    // Seuls les 4xx le sont.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    fetchCurrentUser.mockRejectedValue(new ApiError(500, {}))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt.token.here')
  })

  // Sans préfixe `AC-n:`, et c'est le point : ces deux tests décrivent la
  // transition d'état du fournisseur, qu'aucun critère de REQ-WEB-002 ne nomme.
  // Ils portaient `AC-5:`, dont le `then:` réel est « rendu serveur, stockage
  // absent, état anonyme sans erreur » — un comportement qu'ils ne touchent pas
  // (ils rendent côté client). La matrice rapproche des libellés, pas des
  // comportements : le critère paraissait donc couvert deux fois de plus qu'il
  // ne l'était. Quatrième occurrence du motif consigné dans `artifacts/lessons.md`.
  it('atteint « authenticated » quand la réhydratation aboutit', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
  })

  it('reste « pending » tant que la réhydratation n’a pas répondu', async () => {
    // La version précédente de ce test n'observait que l'état **final**. Retirer
    // entièrement l'état `pending` de l'implémentation la laissait verte — elle
    // ne prouvait donc pas la distinction qu'elle annonçait. Observer l'état
    // transitoire exige une promesse qu'on contrôle.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    let resolveFetch: ((user: User) => void) | undefined
    fetchCurrentUser.mockReturnValue(
      new Promise<User>((resolve) => {
        resolveFetch = resolve
      })
    )

    renderProbe()

    // « pas encore résolu » — et surtout pas « anonyme », qui ferait rediriger
    // une page authentifiée alors que l'utilisateur a bien une session.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('pending'))
    expect(screen.getByTestId('username')).toHaveTextContent('anonyme')

    await act(async () => {
      resolveFetch?.(jake)
    })

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
  })

  it('rapporte « anonymous » seulement après résolution', async () => {
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })

  it('AC-1: une connexion pendant une réhydratation en vol n’est pas écrasée par celle-ci', async () => {
    // Le fournisseur reste monté pendant toute la navigation App Router : la
    // réponse tardive d'un `GET /user` lancé au démarrage peut donc retomber
    // **après** qu'un utilisateur s'est connecté avec un autre compte. Sans
    // garde, elle réapplique l'ancien compte et réécrit l'ancien jeton par-dessus
    // le nouveau — la session fraîchement ouverte disparaît sans erreur.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jeton.ancien')
    let resolveFetch: ((user: User) => void) | undefined
    fetchCurrentUser.mockReturnValue(
      new Promise<User>((resolve) => {
        resolveFetch = resolve
      })
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('pending'))

    // L'utilisateur se connecte avant que la réhydratation ait répondu.
    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(jake.token)

    // La réponse tardive arrive, portant l'ancien compte.
    await act(async () => {
      resolveFetch?.({ ...jake, username: 'ancien', token: 'jeton.ancien' })
    })

    expect(screen.getByTestId('username')).toHaveTextContent('jake')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(jake.token)
  })

  it('AC-3: une déconnexion pendant une réhydratation en vol n’est pas annulée par celle-ci', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jeton.ancien')
    let resolveFetch: ((user: User) => void) | undefined
    fetchCurrentUser.mockReturnValue(
      new Promise<User>((resolve) => {
        resolveFetch = resolve
      })
    )

    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('pending'))

    await act(async () => {
      screen.getByRole('button', { name: 'déconnexion' }).click()
    })

    await act(async () => {
      resolveFetch?.(jake)
    })

    // Une déconnexion que la réponse tardive ressusciterait est pire qu'un bug
    // d'affichage : l'utilisateur croit avoir fermé sa session.
    expect(screen.getByTestId('username')).toHaveTextContent('anonyme')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})

describe('REQ-WEB-007 — contrat de sélecteurs, stockage et interface de débogage', () => {
  it('AC-5: n’écrit que la chaîne du jeton, sous la clé du contrat', async () => {
    renderProbe()

    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })

    // La valeur est le JWT nu : un JSON sous cette clé satisferait le nom et
    // trahirait le contrat, et un test E2E qui forge une requête avec cette
    // valeur enverrait un objet dans l'en-tête `Authorization`.
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY)
    expect(stored).toBe(jake.token)
    expect(() => JSON.parse(stored ?? '')).toThrow()
  })

  it('AC-5: ne laisse aucune autre clé porter la session', async () => {
    renderProbe()

    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })

    // Deux clés se désynchronisent tôt ou tard, et la divergence ne se voit
    // qu'en E2E — loin de sa cause (ADR 014, option B écartée).
    //
    // Les clés sont énumérées par l'API `Storage` et non par `Object.keys` :
    // celui-ci remonte aussi les propriétés propres de l'implémentation jsdom,
    // et le test échouait sur une clé `entries` qui n'a jamais été écrite.
    const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index)
    )
    expect(keys).toEqual([TOKEN_STORAGE_KEY])
  })

  it('AC-6: expose les trois fonctions du contrat de débogage', async () => {
    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__).toBeDefined())
    expect(typeof window.__conduit_debug__?.getToken).toBe('function')
    expect(typeof window.__conduit_debug__?.getAuthState).toBe('function')
    expect(typeof window.__conduit_debug__?.getCurrentUser).toBe('function')
  })

  it('AC-6: rapporte le compte courant et son jeton', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')

    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__?.getCurrentUser()).toEqual(jake))
    expect(window.__conduit_debug__?.getToken()).toBe('jwt.token.here')
  })

  it('AC-7: rapporte « loading » tant que la réhydratation n’a pas répondu', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    // Une promesse qui ne se résout jamais fige l'état intermédiaire, seul
    // moyen de l'observer : avec une réponse immédiate, il ne dure qu'un rendu.
    fetchCurrentUser.mockReturnValue(new Promise(() => {}))

    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__).toBeDefined())
    expect(window.__conduit_debug__?.getAuthState()).toBe('loading')
    expect(window.__conduit_debug__?.getCurrentUser()).toBeNull()
  })

  it('AC-6: rapporte le jeton conservé avant même que la session soit résolue', async () => {
    // La fenêtre de réhydratation dure le temps d'une requête (ADR 014). Un
    // outil externe qui interroge pendant cette fenêtre — ce que fait la suite
    // amont juste après un rechargement — lirait `null` si l'interface rapportait
    // l'instantané de session, et conclurait que le jeton a été purgé. Le test
    // qui l'a révélé était instable : vert ou rouge selon la vitesse du poste.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    fetchCurrentUser.mockReturnValue(new Promise(() => {}))

    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__).toBeDefined())
    expect(window.__conduit_debug__?.getAuthState()).toBe('loading')
    expect(window.__conduit_debug__?.getToken()).toBe('jwt.token.here')
  })

  it('AC-7: rapporte « authenticated » une fois la session ouverte', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')

    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__?.getAuthState()).toBe('authenticated'))
  })

  it('AC-6: retire l’interface au démontage du fournisseur', async () => {
    // Le `beforeEach` de chaque fichier de test purge lui-même la propriété, ce
    // qui masquait l'absence du vrai nettoyage : le retirer de la production
    // laissait 44 tests verts. Sans lui, un fournisseur démonté laisserait un
    // objet obsolète accessible depuis la même origine, qui continuerait de
    // rapporter un état figé — l'inverse de ce que l'interface promet.
    const { unmount } = renderProbe()
    await waitFor(() => expect(window.__conduit_debug__).toBeDefined())

    unmount()

    expect(window.__conduit_debug__).toBeUndefined()
  })

  it('AC-7: rapporte « unauthenticated » et non « loading » à un anonyme résolu', async () => {
    // Les deux se ressemblent — aucun utilisateur — et la suite E2E attend
    // l'un ou l'autre pour continuer. Les confondre bloquerait les tests
    // anonymes jusqu'au délai d'attente, sur un symptôme sans rapport.
    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__?.getAuthState()).toBe('unauthenticated'))
    expect(window.__conduit_debug__?.getToken()).toBeNull()
  })
})

describe('REQ-WEB-016 — mode indisponible au démarrage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-1: entre en mode indisponible sur une panne serveur, jeton conservé', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValue(new ApiError(500, {}))

    renderProbe()

    // « unavailable » et non « anonymous » : c'est toute la différence entre
    // « votre session a expiré » et « je n'ai pas pu vérifier ».
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mon.jeton')
  })

  it('AC-2: entre en mode indisponible quand aucune réponse ne revient', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mon.jeton')
  })

  it('AC-2 (étendu) : entre en mode indisponible quand la requête ne répond jamais', async () => {
    // AC-2 couvrait déjà le rejet immédiat (panne de transport). Ce qu'il ne
    // couvrait pas est la requête qui ne se termine **jamais** — ni succès, ni
    // rejet, une connexion que le serveur ne referme pas. Depuis REQ-WEB-005
    // AC-7, `pending` gate aussi `ArticleView` et `ProfileView` : sans borne,
    // ce contenu public resterait bloqué indéfiniment derrière un `GET /user`
    // qui pend.
    vi.useFakeTimers()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockReturnValue(new Promise<User>(() => undefined))

    renderProbe()

    expect(screen.getByTestId('status')).toHaveTextContent('pending')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REHYDRATION_TIMEOUT_MS)
    })

    expect(screen.getByTestId('status')).toHaveTextContent('unavailable')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mon.jeton')
  })

  it('AC-3: traite un corps illisible comme une panne, pas comme un refus', async () => {
    // Le cas qu'on classe à tort du côté de l'authentification : un JSON
    // malformé arrive avec un **200**, donc l'API n'a rien refusé. Purger ici
    // déconnecterait tout le monde pour un défaut de sérialisation.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValue(new SyntaxError('Unexpected token } in JSON'))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mon.jeton')
  })

  it('AC-5: rapporte « unavailable » au contrat de débogage', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValue(new ApiError(503, {}))

    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__?.getAuthState()).toBe('unavailable'))
    // Le jeton reste lisible par le contrat : c'est ce qu'un outil externe
    // vérifie pour distinguer « conservé » de « purgé ».
    expect(window.__conduit_debug__?.getToken()).toBe('mon.jeton')
  })

  it('AC-6: rouvre la session dès qu’une tentative aboutit, sans rechargement', async () => {
    vi.useFakeTimers()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValueOnce(new ApiError(500, {})).mockResolvedValue(jake)

    renderProbe()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('status')).toHaveTextContent('unavailable')

    // Sans cette reprise, l'indicateur « reconnexion en cours » annoncerait une
    // tentative qui n'aura jamais lieu : l'état ne se rouvrirait qu'au
    // rechargement, que rien n'invite à faire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS)
    })

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('username')).toHaveTextContent('jake')
  })

  it('AC-7: réessaie avec le jeton conservé tant que l’API ne répond pas', async () => {
    vi.useFakeTimers()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValue(new ApiError(500, {}))

    renderProbe()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 2)
    })

    // Le jeton n'a pas bougé entre les tentatives : c'est ce qui permet à un
    // rechargement manuel, au milieu de tout ça, de retrouver la session.
    expect(fetchCurrentUser.mock.calls.length).toBeGreaterThan(1)
    expect(fetchCurrentUser).toHaveBeenLastCalledWith('mon.jeton')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mon.jeton')
  })

  it('AC-7: arrête de réessayer dès qu’une connexion explicite ouvre la session', async () => {
    // La reprise doit mourir avec l'état qui l'a justifiée. Sans cette garde,
    // une tentative en vol retomberait après le `signIn` et réécrirait l'ancien
    // jeton par-dessus le nouveau — le défaut que la génération ferme déjà pour
    // la première tentative, et qu'une boucle de reprise rouvrirait.
    vi.useFakeTimers()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'mon.jeton')
    fetchCurrentUser.mockRejectedValue(new ApiError(500, {}))

    renderProbe()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })
    const callsAtSignIn = fetchCurrentUser.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 3)
    })

    expect(fetchCurrentUser.mock.calls.length).toBe(callsAtSignIn)
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(jake.token)
  })
})
