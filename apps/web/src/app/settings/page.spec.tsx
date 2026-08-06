import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import { SessionProvider, TOKEN_STORAGE_KEY, useSession } from '../../lib/session'
import SettingsPage from './page'

/**
 * Premier test de **page** du dépôt.
 *
 * La revue de F4 a montré que « les pages relèvent de Playwright » avait laissé
 * passer deux défauts réels : la redirection éjectait les utilisateurs
 * connectés, et REQ-WEB-004 AC-4 — « la session porte le compte à jour » —
 * n'était couvert par rien, son libellé ayant été posé sur un test qui vérifiait
 * l'affichage des erreurs.
 *
 * Ces comportements vivent dans la **composition** de la page (session + API +
 * routeur), pas dans le formulaire : aucun test de composant ne pouvait les
 * atteindre.
 */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const updateUser = vi.hoisted(() => vi.fn())
vi.mock('../../lib/api-provider', () => ({ useApi: () => ({ updateUser }) }))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

/**
 * Rend le username de la session, comme le fait la barre de navigation, et
 * permet de la fermer depuis l'extérieur de la page.
 *
 * Ce second rôle sert un cas qu'aucun geste de la page ne produit : la session
 * qui se ferme **pendant** l'édition, à cause d'un 401 sur une requête que
 * l'utilisateur n'a pas déclenchée lui-même.
 */
function SessionEcho() {
  const { user, signOut } = useSession()
  return (
    <>
      <span data-testid="session-username">{user?.username ?? 'anonyme'}</span>
      <button type="button" onClick={signOut}>
        fermer la session
      </button>
    </>
  )
}

/**
 * La réhydratation passe par l'API depuis l'ADR 014 : le stockage ne porte plus
 * que le jeton, et le compte est redemandé. On injecte donc la réponse plutôt
 * que d'écrire un `User` complet dans le stockage, ce qui ne signifierait plus
 * rien.
 */
const renderPage = () =>
  render(
    <SessionProvider fetchCurrentUser={async () => jake}>
      <SettingsPage />
      <SessionEcho />
    </SessionProvider>
  )

beforeEach(() => {
  push.mockClear()
  updateUser.mockReset().mockResolvedValue({ ...jake, username: 'jake-renomme' })
})

describe('REQ-WEB-004 — page de paramètres', () => {
  it('AC-5: n’éjecte PAS un utilisateur connecté au chargement direct', async () => {
    // Le défaut trouvé en revue : les effets React se déclenchent des enfants
    // vers les parents, donc l'effet de la page s'exécutait avant que le
    // fournisseur ait relu le stockage — et `user === null` était pris pour
    // « anonyme » alors qu'il signifiait « pas encore résolu ».
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    renderPage()

    await waitFor(() => expect(screen.getByDisplayValue('jake')).toBeInTheDocument())
    expect(push).not.toHaveBeenCalled()
  })

  it('AC-5: redirige un visiteur anonyme vers la connexion', async () => {
    renderPage()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
    expect(screen.queryByRole('button', { name: 'Update Settings' })).not.toBeInTheDocument()
  })

  it('AC-4: rafraîchit la session avec le compte à jour', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    renderPage()
    await waitFor(() => expect(screen.getByDisplayValue('jake')).toBeInTheDocument())

    await userEvent.clear(screen.getByPlaceholderText('Your Name'))
    await userEvent.type(screen.getByPlaceholderText('Your Name'), 'jake-renomme')
    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    // C'est l'objet réel de AC-4 : sans `signIn(updated)`, le lien de profil de
    // la navbar afficherait l'ancien username jusqu'au prochain rechargement —
    // un décalage que l'utilisateur attribue à un échec de l'enregistrement.
    await waitFor(() =>
      expect(screen.getByTestId('session-username')).toHaveTextContent('jake-renomme')
    )
  })

  it('AC-6: ferme la session et revient à l’accueil', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    renderPage()
    await waitFor(() => expect(screen.getByDisplayValue('jake')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /Or click here to logout/ }))

    expect(screen.getByTestId('session-username')).toHaveTextContent('anonyme')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('AC-7: garde le formulaire et son message quand la session expire à l’enregistrement', async () => {
    // Le défaut que ce critère ferme : le 401 purge la session (REQ-WEB-002
    // AC-4), la page passe en « anonyme », et la redirection de AC-5 la vidait
    // avant que le message n'apparaisse. L'utilisateur voyait sa saisie
    // disparaître sans jamais lire pourquoi.
    updateUser.mockRejectedValue(new ApiError(401, {}))
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    renderPage()
    const username = await screen.findByDisplayValue('jake')

    await userEvent.type(username, '-bis')
    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    await waitFor(() => expect(screen.getByText(/session has expired/)).toBeInTheDocument())
    expect(screen.getByDisplayValue('jake-bis')).toBeInTheDocument()
  })

  it('AC-7: reste affichée quand la session se ferme pendant l’édition', async () => {
    // La purge elle-même appartient au client API (REQ-WEB-002 AC-4) et n'est
    // pas rejouable ici, `useApi` étant doublé. Ce qui se teste est sa
    // **conséquence** sur cette page : la session passe en anonyme alors que le
    // formulaire est monté, et il doit y rester — c'est exactement l'état dans
    // lequel un 401 à l'enregistrement laisse la page.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    renderPage()
    await screen.findByDisplayValue('jake')

    await userEvent.click(screen.getByRole('button', { name: 'fermer la session' }))

    expect(screen.getByTestId('session-username')).toHaveTextContent('anonyme')
    expect(screen.getByDisplayValue('jake')).toBeInTheDocument()
    // Et surtout : pas de redirection. Elle viderait la page avant que
    // l'utilisateur ait lu quoi que ce soit.
    expect(push).not.toHaveBeenCalledWith('/login')
  })

  it('AC-5: redirige quand même le visiteur qui arrive sans session', async () => {
    // La garde d'AC-7 ne doit pas désarmer AC-5 : personne ne doit rester
    // devant un formulaire de paramètres sans compte résolu.
    renderPage()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
  })
})
