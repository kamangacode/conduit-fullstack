import type { ArticleSummary, User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedKind } from '../lib/feed-query'
import { SessionProvider } from '../lib/session'
import { FeedList } from './FeedList'

/** Tests écrits depuis les critères de REQ-WEB-009, avant l'implémentation. */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const listArticles = vi.hoisted(() => vi.fn())
const getFeed = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({
  useApi: () => ({ listArticles, getFeed, favoriteArticle: vi.fn(), unfavoriteArticle: vi.fn() }),
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
  tagList: [],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jacob', bio: null, image: null, following: false },
}

const renderList = (feed: FeedKind = { kind: 'global' }, page = 1) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <SessionProvider fetchCurrentUser={async () => jake}>
        <FeedList feed={feed} page={page} pathname="/" searchParams={new URLSearchParams()} />
      </SessionProvider>
    </QueryClientProvider>
  )

beforeEach(() => {
  window.localStorage.clear()
  listArticles.mockReset().mockResolvedValue({ articles: [article], articlesCount: 1 })
  getFeed.mockReset().mockResolvedValue({ articles: [], articlesCount: 0 })
})

describe('REQ-WEB-009 — liste du flux', () => {
  it('AC-1: rend un aperçu par article du flux', async () => {
    const { container } = renderList()

    await waitFor(() => expect(container.querySelectorAll('.article-preview')).toHaveLength(1))
    expect(screen.getByText('How to train your dragon')).toBeInTheDocument()
  })

  it('AC-5: affiche le message d’absence plutôt qu’une liste vide muette', async () => {
    listArticles.mockResolvedValue({ articles: [], articlesCount: 0 })

    const { container } = renderList()

    // Sans message, le lecteur ne peut pas distinguer « il n'y a rien » de
    // « ça charge encore ».
    await waitFor(() => expect(container.querySelector('.empty-feed-message')).toBeInTheDocument())
  })

  it('AC-5: distingue un échec de chargement d’une absence d’articles', async () => {
    // Les deux se ressemblent à l'écran et appellent des gestes différents :
    // attendre, ou réessayer. Déguiser une panne en liste vide envoie le
    // lecteur sur une fausse piste.
    listArticles.mockRejectedValue(new Error('réseau'))

    const { container } = renderList()

    await waitFor(() => expect(screen.getByText(/Unable to load/)).toBeInTheDocument())
    expect(container.querySelector('.empty-feed-message')).toBeNull()
  })

  it('AC-2: charge le flux personnel par son endpoint dédié', async () => {
    renderList({ kind: 'following' })

    await waitFor(() => expect(getFeed).toHaveBeenCalledOnce())
    expect(listArticles).not.toHaveBeenCalled()
  })

  it('AC-1: pagine avec le total annoncé, pas le nombre d’articles reçus', async () => {
    listArticles.mockResolvedValue({ articles: [article], articlesCount: 47 })

    const { container } = renderList()

    await waitFor(() => expect(container.querySelector('.pagination')).not.toBeNull())
    expect(container.querySelectorAll('li.page-item')).toHaveLength(5)
  })

  it('AC-8: dit au lecteur quoi faire d’un flux personnel vide', async () => {
    // « Aucun article » ne veut pas dire la même chose des deux côtés : sur le
    // flux personnel, c'est la conséquence de ne suivre personne, et le geste
    // qui en sort est d'aller voir le flux global. Le message referme donc
    // lui-même l'impasse qu'il annonce.
    getFeed.mockResolvedValue({ articles: [], articlesCount: 0 })

    const { container } = renderList({ kind: 'following' })

    await waitFor(() => expect(container.querySelector('.empty-feed-message')).toBeInTheDocument())
    const message = container.querySelector('.empty-feed-message')
    expect(message).toHaveTextContent('Your feed is empty')
    expect(message?.querySelector('a[href="/"]')).not.toBeNull()
  })

  it('AC-9: garde le message générique sur un flux public vide', async () => {
    // Un flux global vide ne parle pas au lecteur de son propre flux : il n'a
    // rien à y faire, et l'y renvoyer serait une invitation sans objet.
    listArticles.mockResolvedValue({ articles: [], articlesCount: 0 })

    const { container } = renderList({ kind: 'tag', tag: 'dragons' })

    await waitFor(() => expect(container.querySelector('.empty-feed-message')).toBeInTheDocument())
    const message = container.querySelector('.empty-feed-message')
    expect(message).not.toHaveTextContent('Your feed')
    expect(message?.querySelector('a')).toBeNull()
  })
})

describe('REQ-WEB-015 — listes du profil', () => {
  it('AC-5: rend le message d’absence sur un onglet de profil vide', async () => {
    // L'exigence demande que ces listes se comportent **exactement** comme
    // celles de l'accueil. L'écrire comme un critère plutôt que le supposer est
    // ce qui empêche une seconde implémentation de liste de s'installer : si
    // quelqu'un en écrivait une pour le profil, ce test tomberait.
    listArticles.mockResolvedValue({ articles: [], articlesCount: 0 })

    const { container } = renderList({ kind: 'author', username: 'jacob' })

    await waitFor(() => expect(container.querySelector('.empty-feed-message')).toBeInTheDocument())
  })

  it('AC-6: pagine un onglet de profil avec le total annoncé', async () => {
    listArticles.mockResolvedValue({ articles: [article], articlesCount: 47 })

    const { container } = renderList({ kind: 'favorited', username: 'jacob' })

    await waitFor(() => expect(container.querySelectorAll('li.page-item')).toHaveLength(5))
  })

  it('AC-6: pagine un onglet de profil avec le nouveau contrôle', async () => {
    // Non-régression du passage au formulaire GET ([ADR 023]) : le profil hérite
    // de `Pagination` par son unique chemin (`FeedList`), il n'a pas de seconde
    // implémentation — et c'est ce test qui le prouve plutôt que de le supposer.
    listArticles.mockResolvedValue({ articles: [article], articlesCount: 47 })

    const { container } = renderList({ kind: 'author', username: 'jacob' })

    await waitFor(() =>
      expect(container.querySelector('li.page-item form button.page-link')).not.toBeNull()
    )
  })
})
