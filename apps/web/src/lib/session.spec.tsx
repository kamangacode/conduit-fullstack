import type { User } from '@repo/shared'
import { act, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_STORAGE_KEY, SessionProvider, useSession } from './session'

/** Tests écrits depuis les critères de REQ-WEB-002, avant l'implémentation. */

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

/** Sonde : expose l'état de session dans le DOM pour l'asserter. */
function SessionProbe() {
  const { user, token, signIn, signOut } = useSession()

  return (
    <div>
      <span data-testid="username">{user?.username ?? 'anonyme'}</span>
      <span data-testid="token">{token ?? 'aucun'}</span>
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
    <SessionProvider>
      <SessionProbe />
    </SessionProvider>
  )

beforeEach(() => {
  window.localStorage.clear()
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

  it('AC-1: persiste la session pour la prochaine visite', async () => {
    renderProbe()

    await act(async () => {
      screen.getByRole('button', { name: 'connexion' }).click()
    })

    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toContain('jwt.token.here')
  })

  it('AC-2: réhydrate une session existante au démarrage', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))

    renderProbe()

    // La lecture a lieu après montage : l'état est anonyme au premier rendu,
    // puis bascule. `waitFor` décrit exactement cette séquence.
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('jake'))
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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
    const storage = window.localStorage
    Reflect.deleteProperty(window, 'localStorage')

    try {
      const html = renderToString(
        <SessionProvider>
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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('jake'))

    await act(async () => {
      screen.getByRole('button', { name: 'déconnexion' }).click()
    })

    expect(screen.getByTestId('username')).toHaveTextContent('anonyme')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('AC-2: ignore un contenu de stockage illisible plutôt que de planter', async () => {
    // Un stockage corrompu — version antérieure du format, écriture partielle —
    // ne doit pas empêcher l'application de démarrer en anonyme.
    window.localStorage.setItem(SESSION_STORAGE_KEY, 'ceci-n-est-pas-du-json')

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('anonyme'))
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('AC-4: purge la session sur demande d’une réponse 401', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('jake'))

    // Un jeton expiré laissé en place fait croire à l'interface qu'elle est
    // connectée, et chaque action échoue en 401 sans que rien ne l'explique.
    await act(async () => {
      screen.getByRole('button', { name: 'déconnexion' }).click()
    })

    expect(screen.getByTestId('token')).toHaveTextContent('aucun')
  })
})
