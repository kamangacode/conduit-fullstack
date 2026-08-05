import type { ArticleSummary, User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { ArticlePreview } from './ArticlePreview'

/** Tests écrits depuis les critères de REQ-WEB-011, avant l'implémentation. */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const favoriteArticle = vi.hoisted(() => vi.fn())
const unfavoriteArticle = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({
  useApi: () => ({ favoriteArticle, unfavoriteArticle }),
}))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const article: ArticleSummary = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 29,
  author: { username: 'jacob', bio: null, image: null, following: false },
}

const renderPreview = (overrides: Partial<ArticleSummary> = {}) =>
  render(
    <SessionProvider fetchCurrentUser={async () => jake}>
      <ArticlePreview article={{ ...article, ...overrides }} />
    </SessionProvider>
  )

/** Rend l'aperçu avec une session ouverte, hydratation attendue. */
const renderSignedIn = async (overrides: Partial<ArticleSummary> = {}) => {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
  const result = renderPreview(overrides)
  await waitFor(() => expect(favoriteButton()).toBeEnabled())
  return result
}

const favoriteButton = () => screen.getByRole('button')

beforeEach(() => {
  window.localStorage.clear()
  push.mockClear()
  // Les compteurs renvoyés (47, 12) sont **volontairement inatteignables** par
  // un incrément local à partir de 29 ou 30. Une bascule optimiste — le réflexe
  // naturel — produirait exactement les valeurs qu'on attendrait naïvement, et
  // un test qui les asserte resterait vert sans rien prouver. En prendre de
  // franchement autres force l'implémentation à lire la réponse. Ce n'est pas
  // artificiel : d'autres lecteurs favorisent le même article entre-temps.
  favoriteArticle.mockReset().mockResolvedValue({ ...article, favorited: true, favoritesCount: 47 })
  unfavoriteArticle
    .mockReset()
    .mockResolvedValue({ ...article, favorited: false, favoritesCount: 12 })
})

describe('REQ-WEB-011 — aperçu d’article', () => {
  it('AC-1: suit le markup du template et lie vers l’article', () => {
    const { container } = renderPreview()

    expect(container.querySelector('.article-preview')).not.toBeNull()
    expect(container.querySelector('.article-meta')).not.toBeNull()
    expect(container.querySelector('a.preview-link')).toHaveAttribute(
      'href',
      '/article/how-to-train-your-dragon'
    )
    expect(container.querySelector('a.author')).toHaveTextContent('jacob')
    expect(container.querySelector('.preview-link h1')).toHaveTextContent(
      'How to train your dragon'
    )
    expect(container.querySelector('.preview-link p')).toHaveTextContent('Ever wonder how?')
  })

  it('AC-1: rend chaque tag dans la liste du template', () => {
    const { container } = renderPreview()

    const tags = container.querySelectorAll('ul.tag-list li.tag-default.tag-pill.tag-outline')
    expect([...tags].map((tag) => tag.textContent)).toEqual(['dragons', 'training'])
  })

  it('AC-7: rend une liste de tags vide sans élément résiduel', () => {
    const { container } = renderPreview({ tagList: [] })

    expect(container.querySelectorAll('ul.tag-list li')).toHaveLength(0)
  })

  it('AC-2: affiche le bouton en état « non favorisé » avec le compteur', () => {
    renderPreview()

    // Le contrat de sélecteurs définit l'état **par la classe** : les inverser
    // produit une interface d'apparence correcte et des tests E2E qui affirment
    // le contraire de la réalité.
    expect(favoriteButton()).toHaveClass('btn-outline-primary')
    expect(favoriteButton()).not.toHaveClass('btn-primary')
    expect(favoriteButton()).toHaveTextContent('29')
  })

  it('AC-3: affiche le bouton en état « favorisé » quand le lecteur l’a favorisé', () => {
    renderPreview({ favorited: true })

    expect(favoriteButton()).toHaveClass('btn-primary')
    expect(favoriteButton()).not.toHaveClass('btn-outline-primary')
  })

  it('AC-4: prend l’état et le compteur dans la réponse de l’API', async () => {
    await renderSignedIn()

    await userEvent.click(favoriteButton())

    // 47 ne peut pas venir d'un `+1` sur 29 : seul le fait de lire la réponse
    // produit cette valeur. Une bascule optimiste divergerait de la base au
    // premier échec, sans rien pour resynchroniser.
    await waitFor(() => expect(favoriteButton()).toHaveTextContent('47'))
    expect(favoriteButton()).toHaveClass('btn-primary')
    expect(favoriteArticle).toHaveBeenCalledWith('how-to-train-your-dragon')
  })

  it('AC-4: retire le favori par l’endpoint de retrait', async () => {
    await renderSignedIn({ favorited: true, favoritesCount: 30 })

    await userEvent.click(favoriteButton())

    await waitFor(() => expect(favoriteButton()).toHaveClass('btn-outline-primary'))
    expect(favoriteButton()).toHaveTextContent('12')
    expect(unfavoriteArticle).toHaveBeenCalledWith('how-to-train-your-dragon')
    expect(favoriteArticle).not.toHaveBeenCalled()
  })

  it('AC-5: conduit un anonyme à la connexion, sans appeler l’API', async () => {
    renderPreview()

    await userEvent.click(favoriteButton())

    expect(push).toHaveBeenCalledWith('/login')
    // Laisser partir l'appel produirait un 401 à traduire en message, là où le
    // comportement attendu est simplement d'aller se connecter.
    expect(favoriteArticle).not.toHaveBeenCalled()
  })

  it('AC-6: laisse l’état inchangé quand la bascule échoue', async () => {
    favoriteArticle.mockRejectedValue(new Error('réseau'))
    await renderSignedIn()

    await userEvent.click(favoriteButton())

    // Le compteur ne doit pas dériver : sans cette garantie, l'affichage et la
    // base cessent de dire la même chose et rien ne les resynchronise avant un
    // rechargement.
    await waitFor(() => expect(favoriteButton()).toBeEnabled())
    expect(favoriteButton()).toHaveTextContent('29')
    expect(favoriteButton()).toHaveClass('btn-outline-primary')
  })

  it('AC-1: retombe sur l’avatar par défaut quand l’auteur n’a pas d’image', () => {
    const { container } = renderPreview()

    expect(container.querySelector('.article-meta img')?.getAttribute('src')).toContain(
      'default-avatar.svg'
    )
  })
})
