import type { User } from '@repo/shared'
import { act, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api-client'
import { SessionProvider, TOKEN_STORAGE_KEY, useSession } from './session'

/** Tests écrits depuis les critères de REQ-WEB-002 et REQ-WEB-007. */

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

  it('AC-7: conserve le jeton quand l’API est injoignable', async () => {
    // La distinction qui compte : un 401 est une réponse d'autorité, une panne
    // réseau n'en est pas une. Purger sur ce second signal transformerait une
    // coupure de trente secondes en déconnexion de tous les visiteurs.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    fetchCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt.token.here')
  })

  it('AC-7: ne purge pas non plus sur une panne serveur', async () => {
    // Un 500 n'est pas davantage un verdict sur le jeton qu'une coupure réseau.
    // Seul le 401 l'est.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')
    fetchCurrentUser.mockRejectedValue(new ApiError(500, {}))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt.token.here')
  })

  it('AC-5: distingue « pas encore résolu » de « anonyme »', async () => {
    // La distinction qui manquait, et qui a coûté un vrai défaut : une page qui
    // redirige sur `user === null` éjecte les utilisateurs connectés, parce que
    // son effet s'exécute avant celui de ce fournisseur.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
  })

  it('AC-5: rapporte « anonymous » seulement après résolution', async () => {
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
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

  it('AC-7: rapporte « authenticated » une fois la session ouverte', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt.token.here')

    renderProbe()

    await waitFor(() => expect(window.__conduit_debug__?.getAuthState()).toBe('authenticated'))
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
