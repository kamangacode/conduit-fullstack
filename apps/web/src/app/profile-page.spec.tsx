import type { Profile } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { ProfilePage } from './profile-page'

/**
 * Tests de **page**, écrits en réponse à une revue puis étendus aux onglets.
 *
 * Ils visent le module partagé plutôt qu'une des deux routes : celles-ci sont
 * des adaptateurs de deux lignes qui n'ajoutent que le décodage du chemin et
 * l'onglet demandé. Tester l'une d'elles ferait rendre un composant asynchrone
 * imbriqué, ce que Testing Library ne sait pas attendre sans échafaudage.
 *
 * La page est un **Server Component asynchrone** : on l'appelle comme une
 * fonction et on rend l'élément qu'elle retourne, faute de pouvoir la monter.
 */

const getProfile = vi.hoisted(() => vi.fn())
const listArticles = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api-client')>()),
  createApiClient: () => ({ getProfile, listArticles }),
}))

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)
vi.mock('next/navigation', () => ({ notFound }))

// `FollowButton` et `FeedList` sont des composants clients qui consomment la
// session, le client API et le cache de requêtes : ils ont leurs propres specs,
// et les monter ici ferait échouer ces tests pour une raison sans rapport avec
// ce qu'ils vérifient.
vi.mock('../components/FollowButton', () => ({ FollowButton: () => null }))
vi.mock('../components/FeedList', () => ({
  FeedList: ({ feed, pathname }: { feed: { kind: string }; pathname: string }) => (
    <div data-testid="feed" data-kind={feed.kind} data-pathname={pathname} />
  ),
}))

const jacob: Profile = { username: 'jacob', bio: null, image: null, following: false }

/**
 * Le `HydrationBoundary` de l'ADR 015 exige un `QueryClient` en contexte. Le
 * layout racine le fournit en production ; ici il faut le poser, sans quoi la
 * page échoue sur une cause sans rapport avec ce qui est testé.
 */
const renderPage = async (tab: 'author' | 'favorited' = 'author', username = 'jacob') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      {await ProfilePage({ username, tab, searchParams: {} })}
    </QueryClientProvider>
  )

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue(jacob)
  listArticles.mockReset().mockResolvedValue({ articles: [], articlesCount: 0 })
  notFound.mockClear()
})

describe('REQ-WEB-007 — contrat de sélecteurs, page de profil', () => {
  it('AC-3: rend l’avatar par défaut quand le compte n’a pas d’image', async () => {
    const { container } = await renderPage()

    const avatar = container.querySelector('img.user-img')
    expect(avatar).not.toBeNull()
    expect(avatar?.getAttribute('src')).toContain('default-avatar.svg')
  })

  it('AC-4: rend l’image du compte quand elle existe', async () => {
    getProfile.mockResolvedValue({ ...jacob, image: 'https://example.test/jacob.png' })

    const { container } = await renderPage()

    expect(container.querySelector('img.user-img')).toHaveAttribute(
      'src',
      'https://example.test/jacob.png'
    )
  })
})

describe('REQ-WEB-005 — profil public', () => {
  it('AC-1: rend le username et la bio du compte demandé', async () => {
    getProfile.mockResolvedValue({ ...jacob, bio: 'I work at statefarm' })

    const { container } = await renderPage()

    expect(container.querySelector('.profile-page .user-info h4')).toHaveTextContent('jacob')
    expect(container.querySelector('.user-info p')).toHaveTextContent('I work at statefarm')
  })

  it('AC-6: produit une vraie 404 sur un username inconnu', async () => {
    getProfile.mockRejectedValue(new ApiError(404, {}))

    await expect(renderPage('author', 'fantome')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('AC-6: laisse remonter une panne de l’API au lieu de la déguiser en profil absent', async () => {
    // Un 500 traité comme un 404 afficherait « ce compte n'existe pas » pendant
    // une panne — un message faux, au moment le plus coûteux.
    getProfile.mockRejectedValue(new ApiError(500, {}))

    await expect(renderPage()).rejects.toThrow()
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('REQ-WEB-015 — onglets du profil', () => {
  it('AC-1: liste les articles publiés sur l’onglet par défaut', async () => {
    const { getByTestId } = await renderPage('author')

    expect(getByTestId('feed')).toHaveAttribute('data-kind', 'author')
    expect(screen.getByRole('link', { name: 'My Articles' })).toHaveClass('active')
  })

  it('AC-2: liste les articles favorisés sur l’onglet des favoris', async () => {
    const { getByTestId } = await renderPage('favorited')

    expect(getByTestId('feed')).toHaveAttribute('data-kind', 'favorited')
    expect(screen.getByRole('link', { name: 'Favorited Articles' })).toHaveClass('active')
  })

  it('AC-6: la pagination conserve l’onglet courant', async () => {
    // Sans cela, passer à la page 2 des favoris ramènerait aux articles publiés
    // — un bug qui se lit comme une perte de filtre.
    const { getByTestId } = await renderPage('favorited')

    expect(getByTestId('feed')).toHaveAttribute('data-pathname', '/profile/jacob/favorites')
  })
})
