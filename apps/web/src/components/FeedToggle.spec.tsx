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

  it('AC-2: laisse « Global Feed » actif sur `/` pour un lecteur connecté', async () => {
    // Critère amendé ([ADR 022]) : l'onglet actif est désigné par l'**URL**,
    // jamais par la session. Marquer « Your Feed » actif par défaut ferait
    // mentir l'adresse — `/` afficherait le flux global sous un onglet qui
    // annonce le flux personnel.
    signedIn()

    const { container } = renderToggle({ kind: 'global' })

    await screen.findByRole('link', { name: 'Your Feed' })
    expect(container.querySelector('a.nav-link.active')).toHaveTextContent('Global Feed')
    expect(container.querySelectorAll('a.nav-link.active')).toHaveLength(1)
  })

  it('AC-12: pointe chaque onglet vers l’URL exacte du flux', async () => {
    signedIn()

    renderToggle({ kind: 'following' })

    expect(await screen.findByRole('link', { name: 'Your Feed' })).toHaveAttribute(
      'href',
      '/?feed=following'
    )
    expect(screen.getByRole('link', { name: 'Global Feed' })).toHaveAttribute('href', '/')
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

describe('REQ-WEB-010 — remise à la première page en changeant de flux', () => {
  it('AC-11: ne reporte jamais la page courante sur l’onglet d’un autre flux', async () => {
    // Depuis `/?feed=following&page=2`, « Global Feed » doit ramener à `/`
    // exactement. La cible ne porte aucun paramètre **par construction** : c'est
    // ce qui rend la remise à zéro impossible à oublier, là où recopier la
    // requête courante la perdrait au premier onglet ajouté.
    signedIn()

    renderToggle({ kind: 'following' })

    const global = await screen.findByRole('link', { name: 'Global Feed' })
    expect(global.getAttribute('href')).toBe('/')
  })
})
