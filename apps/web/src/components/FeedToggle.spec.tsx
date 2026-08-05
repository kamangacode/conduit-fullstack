import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FeedKind } from '../lib/feed-query'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { FeedToggle } from './FeedToggle'

/** Tests écrits depuis les critères de REQ-WEB-009, avant l'implémentation. */

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const renderToggle = (feed: FeedKind = { kind: 'global' }) =>
  render(
    <SessionProvider fetchCurrentUser={async () => jake}>
      <FeedToggle feed={feed} />
    </SessionProvider>
  )

const signedIn = () => window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

beforeEach(() => {
  window.localStorage.clear()
})

describe('REQ-WEB-009 — onglets de flux', () => {
  it('AC-1: ne propose que le flux global à un anonyme, marqué actif', async () => {
    const { container } = renderToggle()

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Global Feed' })).toBeInTheDocument()
    )
    expect(screen.queryByRole('link', { name: 'Your Feed' })).not.toBeInTheDocument()
    expect(container.querySelector('a.nav-link.active')).toHaveTextContent('Global Feed')
  })

  it('AC-2: propose le flux personnel à un utilisateur connecté', async () => {
    signedIn()

    renderToggle()

    const personal = await screen.findByRole('link', { name: 'Your Feed' })
    // Le contrat de sélecteurs décrit cette URL : elle doit exister comme lien,
    // pas seulement comme état interne.
    expect(personal).toHaveAttribute('href', '/?feed=following')
  })

  it('AC-2: marque le flux personnel actif quand c’est lui qui est affiché', async () => {
    signedIn()

    const { container } = renderToggle({ kind: 'following' })

    await waitFor(() =>
      expect(container.querySelector('a.nav-link.active')).toHaveTextContent('Your Feed')
    )
    expect(container.querySelectorAll('a.nav-link.active')).toHaveLength(1)
  })

  it('AC-4: ajoute un onglet pour le tag choisi, sans faire disparaître les autres', async () => {
    signedIn()

    const { container } = renderToggle({ kind: 'tag', tag: 'dragons' })

    await waitFor(() =>
      expect(container.querySelector('a.nav-link.active')).toHaveTextContent('dragons')
    )
    // Le template garde les onglets précédents : basculer sur un tag ne doit pas
    // enfermer le lecteur, il doit pouvoir revenir au flux d'un clic.
    expect(screen.getByRole('link', { name: 'Global Feed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your Feed' })).toBeInTheDocument()
  })

  it('AC-1: suit le markup RealWorld de la bascule de flux', () => {
    const { container } = renderToggle()

    expect(container.querySelector('.feed-toggle ul.nav.nav-pills.outline-active')).not.toBeNull()
    expect(container.querySelector('li.nav-item a.nav-link')).not.toBeNull()
  })
})
