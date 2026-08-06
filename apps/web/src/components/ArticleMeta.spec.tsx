import type { Article, User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { ArticleMeta } from './ArticleMeta'

/** Tests écrits depuis les critères de REQ-WEB-012, avant l'implémentation. */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const deleteArticle = vi.hoisted(() => vi.fn())
const favoriteArticle = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({
  useApi: () => ({
    deleteArticle,
    favoriteArticle,
    unfavoriteArticle: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
  }),
}))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const article: Article = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: [],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jacob', bio: null, image: null, following: false },
}

/**
 * Le bouton de favori écrit la réponse de l'API dans le cache partagé, qui
 * demande donc un `QueryClient` en contexte. Le layout racine le fournit en
 * production ; ici il faut le poser, sans quoi le composant échoue sur une
 * cause sans rapport avec ce qui est testé.
 */
const renderMeta = (authorUsername = 'jacob') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider fetchCurrentUser={async () => jake}>
        <ArticleMeta
          article={{ ...article, author: { ...article.author, username: authorUsername } }}
        />
      </SessionProvider>
    </QueryClientProvider>
  )

const signedIn = () => window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

beforeEach(() => {
  window.localStorage.clear()
  push.mockClear()
  deleteArticle.mockReset().mockResolvedValue(undefined)
  favoriteArticle.mockReset().mockResolvedValue({ ...article, favorited: true, favoritesCount: 1 })
})

describe('REQ-WEB-012 — méta d’article et actions', () => {
  it('AC-1: suit le markup du template et lie vers le profil de l’auteur', () => {
    const { container } = renderMeta()

    expect(container.querySelector('.article-meta')).not.toBeNull()
    expect(container.querySelector('a.author')).toHaveAttribute('href', '/profile/jacob')
    expect(container.querySelector('.date')).toHaveTextContent('February 18, 2016')
  })

  it('AC-4: ne propose aucune action d’auteur à un lecteur tiers', async () => {
    signedIn()

    renderMeta('jacob')

    await waitFor(() => expect(screen.getByRole('button', { name: /Follow/ })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Delete Article/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Edit Article/ })).not.toBeInTheDocument()
  })

  it('AC-4: ne propose aucune action d’auteur à un anonyme', () => {
    renderMeta('jacob')

    expect(screen.queryByRole('button', { name: /Delete Article/ })).not.toBeInTheDocument()
  })

  it('AC-5: propose modification et suppression à l’auteur', async () => {
    signedIn()

    renderMeta('jake')

    expect(await screen.findByRole('link', { name: /Edit Article/ })).toHaveAttribute(
      'href',
      '/editor/how-to-train-your-dragon'
    )
    expect(screen.getByRole('button', { name: /Delete Article/ })).toBeInTheDocument()
  })

  it('AC-5: ne propose pas à l’auteur de se suivre lui-même', async () => {
    signedIn()

    renderMeta('jake')

    await screen.findByRole('button', { name: /Delete Article/ })
    // Le contrat n'interdit pas l'auto-suivi : l'interface est le seul endroit
    // où l'écarter.
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument()
  })

  it('AC-6: ramène à l’accueil après une suppression réussie', async () => {
    signedIn()
    renderMeta('jake')
    const remove = await screen.findByRole('button', { name: /Delete Article/ })

    await userEvent.click(remove)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(deleteArticle).toHaveBeenCalledWith('how-to-train-your-dragon')
  })

  it('AC-6: signale l’échec au lieu de laisser croire à une suppression', async () => {
    // Sans traitement, le bouton se réactive, rien ne bouge, et l'auteur croit
    // avoir supprimé son article.
    deleteArticle.mockRejectedValue(new Error('réseau'))
    signedIn()
    renderMeta('jake')
    const remove = await screen.findByRole('button', { name: /Delete Article/ })

    await userEvent.click(remove)

    await waitFor(() => expect(screen.getByText(/unable to delete/)).toBeInTheDocument())
    expect(push).not.toHaveBeenCalled()
  })

  it('AC-9: propose le bouton de favori du contrat à un lecteur tiers', async () => {
    // Il manquait : le gabarit RealWorld et `SELECTORS.md` l'attendent tous
    // deux sur cette page, et aucun test du dépôt ne le réclamait — c'est la
    // suite officielle qui l'a signalé, en cherchant un bouton absent.
    signedIn()
    renderMeta('jacob')

    const favorite = await screen.findByRole('button', { name: /Favorite Article/ })
    expect(favorite).toHaveTextContent('(0)')
  })

  it('AC-9: l’actionner appelle l’API pour cet article', async () => {
    signedIn()
    renderMeta('jacob')
    const favorite = await screen.findByRole('button', { name: /Favorite Article/ })
    await waitFor(() => expect(favorite).toBeEnabled())

    await userEvent.click(favorite)

    await waitFor(() => expect(favoriteArticle).toHaveBeenCalledWith('how-to-train-your-dragon'))
  })

  it('AC-9: ne le propose pas à l’auteur, qui ne favorise pas son propre article', async () => {
    signedIn()
    renderMeta('jake')

    await screen.findByRole('button', { name: /Delete Article/ })
    expect(screen.queryByRole('button', { name: /Favorite Article/ })).not.toBeInTheDocument()
  })
})
