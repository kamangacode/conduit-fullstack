import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_STORAGE_KEY, SessionProvider } from '../lib/session'
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

const renderNavbar = () =>
  render(
    <SessionProvider>
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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))

    renderNavbar()

    await waitFor(() => expect(screen.getByRole('link', { name: /jake/ })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /New Article/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('AC-2: le lien de profil porte le username courant', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))

    renderNavbar()

    const profileLink = await screen.findByRole('link', { name: /jake/ })
    expect(profileLink).toHaveAttribute('href', '/profile/jake')
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
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
    const storage = window.localStorage
    Reflect.deleteProperty(window, 'localStorage')

    try {
      const html = renderToString(
        <SessionProvider>
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
