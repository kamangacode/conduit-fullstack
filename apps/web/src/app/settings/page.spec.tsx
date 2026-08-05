import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_STORAGE_KEY, SessionProvider, useSession } from '../../lib/session'
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

/** Rend le username de la session, comme le fait la barre de navigation. */
function SessionEcho() {
  const { user } = useSession()
  return <span data-testid="session-username">{user?.username ?? 'anonyme'}</span>
}

const renderPage = () =>
  render(
    <SessionProvider>
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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))

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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
    renderPage()
    await waitFor(() => expect(screen.getByDisplayValue('jake')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /Or click here to logout/ }))

    expect(screen.getByTestId('session-username')).toHaveTextContent('anonyme')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(push).toHaveBeenCalledWith('/')
  })
})
