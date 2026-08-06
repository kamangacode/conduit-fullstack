import type { User } from '@repo/shared'
import { act, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, TOKEN_STORAGE_KEY, useSession } from '../lib/session'
import { Navbar } from './Navbar'

/** Tests écrits depuis les critères de REQ-WEB-006, avant l'implémentation. */

// `usePathname` vient du routeur Next : hors application, il n'a pas de valeur.
// On le pilote pour éprouver le lien actif (AC-3).
const pathname = vi.hoisted(() => ({ current: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

// Depuis l'ADR 014, le stockage ne porte que le jeton et le compte est
// redemandé à l'API : la réponse est injectée plutôt que persistée.
const renderNavbar = (user: User = jake) =>
  render(
    <SessionProvider fetchCurrentUser={async () => user}>
      <Navbar />
    </SessionProvider>
  )

beforeEach(() => {
  pathname.current = '/'
})

describe('REQ-WEB-006 — barre de navigation', () => {
  it('AC-1: propose connexion et inscription à un anonyme', async () => {
    renderNavbar()

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument()
  })

  it('AC-1: ne propose rien qui suppose un compte à un anonyme', async () => {
    renderNavbar()

    expect(screen.queryByRole('link', { name: /New Article/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument()
  })

  it('AC-2: propose les liens du compte à un utilisateur connecté', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    renderNavbar()

    await waitFor(() => expect(screen.getByRole('link', { name: /jake/ })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /New Article/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('AC-2: le lien de profil porte le username courant', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    renderNavbar()

    const profileLink = await screen.findByRole('link', { name: /jake/ })
    expect(profileLink).toHaveAttribute('href', '/profile/jake')
  })

  it('AC-4: repasse aux liens anonymes à la déconnexion, sans rechargement', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    // La déconnexion est déclenchée depuis la page de paramètres, pas depuis la
    // navbar : on monte donc une sonde qui appelle `signOut`, pour éprouver que
    // la barre réagit au changement de session et non à un rechargement.
    function SignOutProbe() {
      const { signOut } = useSession()
      return (
        <button type="button" onClick={signOut}>
          déconnexion
        </button>
      )
    }

    render(
      <SessionProvider fetchCurrentUser={async () => jake}>
        <Navbar />
        <SignOutProbe />
      </SessionProvider>
    )

    await waitFor(() => expect(screen.getByRole('link', { name: /jake/ })).toBeInTheDocument())

    await act(async () => {
      screen.getByRole('button', { name: 'déconnexion' }).click()
    })

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument()
  })

  it('AC-3: marque le lien de la page courante comme actif', async () => {
    pathname.current = '/login'

    renderNavbar()

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('active')
  })

  it('AC-5: rend les liens anonymes côté serveur, sans divergence d’hydratation', () => {
    // Le rendu serveur ne connaît pas la session : il doit produire la version
    // anonyme, celle que le client rendra aussi au premier passage. Rendre
    // autre chose ici ferait diverger les deux arbres.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    const storage = window.localStorage
    Reflect.deleteProperty(window, 'localStorage')

    try {
      const html = renderToString(
        <SessionProvider fetchCurrentUser={async () => jake}>
          <Navbar />
        </SessionProvider>
      )

      expect(html).toContain('Sign in')
      expect(html).not.toContain('Settings')
    } finally {
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    }
  })

  it('AC-1: suit le markup RealWorld', async () => {
    const { container } = renderNavbar()

    // Les classes ne sont pas décoratives : elles sont le contrat visuel du
    // template RealWorld (rule 11), et le CSS de référence s'y accroche.
    expect(container.querySelector('nav.navbar.navbar-light')).not.toBeNull()
    expect(container.querySelector('a.navbar-brand')).toHaveTextContent('conduit')
    expect(container.querySelectorAll('li.nav-item').length).toBeGreaterThan(0)
  })
})

describe('REQ-WEB-007 — contrat de sélecteurs, barre de navigation', () => {
  it('AC-8: affiche l’avatar du compte en user-pic', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    const { container } = renderNavbar({ ...jake, image: 'https://example.test/jake.png' })

    await waitFor(() => expect(container.querySelector('img.user-pic')).not.toBeNull())
    expect(container.querySelector('img.user-pic')).toHaveAttribute(
      'src',
      'https://example.test/jake.png'
    )
  })

  it('AC-3: retombe sur l’avatar par défaut quand le compte n’a pas d’image', async () => {
    // `jake` n'a pas d'image. Sans repli, le contrat E2E échoue sur un `src`
    // vide — et l'utilisateur voit une icône d'image cassée, ce qui est le
    // genre de détail qu'on ne remarque pas en développant avec un avatar.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    const { container } = renderNavbar()

    await waitFor(() => expect(container.querySelector('img.user-pic')).not.toBeNull())
    expect(container.querySelector('img.user-pic')?.getAttribute('src')).toContain(
      'default-avatar.svg'
    )
  })

  it('AC-8: porte les icônes du template sur les liens éditeur et paramètres', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    const { container } = renderNavbar()

    await waitFor(() => expect(container.querySelector('i.ion-compose')).not.toBeNull())
    expect(container.querySelector('i.ion-gear-a')).not.toBeNull()
  })

  it('AC-8: sépare l’icône du libellé, comme le gabarit', async () => {
    // Le gabarit écrit `<i class="ion-compose"></i>&nbsp;New Article`. En JSX,
    // deux expressions `{…}` séparées par un simple saut de ligne ne produisent
    // **aucune** espace — contrairement au HTML statique, où ce saut se réduit à
    // une espace au rendu. Sans séparateur explicite, le glyphe touche le texte.
    //
    // Aucune règle CSS ne rattrape ce cas : `styles.css` donne bien un
    // `margin-right` à `.nav-link .user-pic`, mais rien à `.nav-link i`. Les
    // tests de classes ci-dessus ne peuvent pas le voir — d'où celui-ci.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    const { container } = renderNavbar()

    await waitFor(() => expect(container.querySelector('i.ion-compose')).not.toBeNull())
    const editorLink = container.querySelector('i.ion-compose')?.closest('a')
    expect(editorLink?.textContent).toBe(' New Article')
  })
})
