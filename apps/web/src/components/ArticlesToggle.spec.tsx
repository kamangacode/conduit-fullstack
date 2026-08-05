import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArticlesToggle } from './ArticlesToggle'

/** Tests écrits depuis les critères de REQ-WEB-015, avant l'implémentation. */

describe('REQ-WEB-015 — onglets du profil', () => {
  it('AC-3: mène chaque onglet à sa route', () => {
    render(<ArticlesToggle username="jacob" active="author" />)

    expect(screen.getByRole('link', { name: 'My Articles' })).toHaveAttribute(
      'href',
      '/profile/jacob'
    )
    expect(screen.getByRole('link', { name: 'Favorited Articles' })).toHaveAttribute(
      'href',
      '/profile/jacob/favorites'
    )
  })

  it('AC-1: marque « My Articles » actif sur le profil', () => {
    const { container } = render(<ArticlesToggle username="jacob" active="author" />)

    const actives = container.querySelectorAll('a.nav-link.active')
    expect(actives).toHaveLength(1)
    expect(actives[0]).toHaveTextContent('My Articles')
  })

  it('AC-2: marque « Favorited Articles » actif sur les favoris', () => {
    const { container } = render(<ArticlesToggle username="jacob" active="favorited" />)

    const actives = container.querySelectorAll('a.nav-link.active')
    expect(actives).toHaveLength(1)
    expect(actives[0]).toHaveTextContent('Favorited Articles')
  })

  it('AC-3: encode un username qui contient un caractère réservé', () => {
    render(<ArticlesToggle username="jean paul" active="author" />)

    expect(screen.getByRole('link', { name: 'My Articles' })).toHaveAttribute(
      'href',
      '/profile/jean%20paul'
    )
  })

  it('AC-3: suit le markup RealWorld des onglets', () => {
    const { container } = render(<ArticlesToggle username="jacob" active="author" />)

    expect(
      container.querySelector('.articles-toggle ul.nav.nav-pills.outline-active')
    ).not.toBeNull()
  })
})
