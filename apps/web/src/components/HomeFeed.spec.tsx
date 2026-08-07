import type { User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import type { FeedKind } from '../lib/feed-query'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { HomeFeed } from './HomeFeed'

/** Tests écrits depuis les critères de REQ-WEB-009, avant l'implémentation. */

const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

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

/**
 * Les quatre états de session, produits par la **vraie** machine à états.
 *
 * Doubler `useSession` aurait été plus court et aurait prouvé moins : le défaut
 * que ces tests visent — rediriger sur `user === null` — ne se voit que si les
 * transitions réelles sont jouées, puisque trois des quatre états portent
 * `user === null`. On pilote donc l'entrée (jeton stocké, réponse de
 * `GET /user`) et on laisse le fournisseur produire le `status`.
 */
const sessions = {
  anonymous: { token: false, fetchCurrentUser: async () => jake },
  authenticated: { token: true, fetchCurrentUser: async () => jake },
  // Jamais résolue : c'est exactement la fenêtre de réhydratation.
  pending: { token: true, fetchCurrentUser: () => new Promise<User>(() => {}) },
  // 5xx : l'API n'a rien dit du jeton, il est conservé (REQ-WEB-016).
  unavailable: {
    token: true,
    fetchCurrentUser: async () => {
      throw new ApiError(503, { api: ['unavailable'] })
    },
  },
} as const

const renderHomeFeed = (
  state: keyof typeof sessions,
  feed: FeedKind = { kind: 'following' },
  page = 1
) => {
  const session = sessions[state]
  if (session.token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
  }

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <SessionProvider fetchCurrentUser={session.fetchCurrentUser}>
        <HomeFeed feed={feed} page={page} pathname="/" searchParams={new URLSearchParams()} />
      </SessionProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  replace.mockReset()
  listArticles.mockReset().mockResolvedValue({ articles: [], articlesCount: 0 })
  getFeed.mockReset().mockResolvedValue({ articles: [], articlesCount: 0 })
})

describe('REQ-WEB-009 — résolution du flux et garde du flux personnel', () => {
  it('AC-3: renvoie un anonyme vers /login sans émettre d’appel authentifié', async () => {
    renderHomeFeed('anonymous')

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    // Le second point compte autant que le premier : monter la liste avant la
    // redirection émettrait un `GET /articles/feed` sans jeton, qui reviendrait
    // en 401 et afficherait un échec au lieu d'une redirection.
    expect(getFeed).not.toHaveBeenCalled()
  })

  it('AC-7: charge le flux personnel d’un lecteur connecté par son endpoint dédié', async () => {
    renderHomeFeed('authenticated')

    await waitFor(() => expect(getFeed).toHaveBeenCalledOnce())
    expect(listArticles).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-7: marque « Your Feed » actif quand l’URL demande le flux personnel', async () => {
    const { container } = renderHomeFeed('authenticated')

    await waitFor(() =>
      expect(container.querySelector('a.nav-link.active')).toHaveTextContent('Your Feed')
    )
  })

  it('AC-2: laisse « Global Feed » actif sur `/` malgré une session ouverte', async () => {
    const { container } = renderHomeFeed('authenticated', { kind: 'global' })

    await waitFor(() => expect(listArticles).toHaveBeenCalledOnce())
    expect(container.querySelector('a.nav-link.active')).toHaveTextContent('Global Feed')
  })

  it('AC-10: n’éjecte pas un lecteur pendant la réhydratation de sa session', async () => {
    // Le défaut déjà payé sur `/settings` : `pending`, `anonymous` et
    // `unavailable` ont tous `user === null`. Une garde écrite sur cette
    // condition renverrait vers `/login` un lecteur parfaitement connecté, le
    // temps d'un aller-retour.
    const { container } = renderHomeFeed('pending')

    await waitFor(() => expect(container.querySelector('.feed-status')).toBeInTheDocument())
    expect(replace).not.toHaveBeenCalled()
    expect(getFeed).not.toHaveBeenCalled()
    // L'écran d'attente ne doit porter aucune des deux classes que le contrat
    // compte, sans quoi il se ferait décompter comme un résultat.
    expect(container.querySelector('.article-preview')).toBeNull()
    expect(container.querySelector('.empty-feed-message')).toBeNull()
  })

  it('AC-11: ne redirige pas un lecteur dont l’API est invérifiable', async () => {
    // Un jeton conservé qu'on n'a pas pu vérifier n'est pas une absence de
    // session (REQ-WEB-016) : l'envoyer au formulaire de connexion lui ferait
    // tenter une action qui échouera pour la même raison.
    const { container } = renderHomeFeed('unavailable')

    await waitFor(() =>
      expect(container.querySelector('.feed-status')).toHaveTextContent(/unavailable/i)
    )
    expect(replace).not.toHaveBeenCalled()
    expect(getFeed).not.toHaveBeenCalled()
  })

  it('AC-12: n’attend aucune session pour afficher un flux public', async () => {
    // Le flux d'un tag est préchargé par le serveur : le garder derrière la
    // résolution de session ferait payer un aller-retour à un contenu qui ne
    // dépend de personne.
    renderHomeFeed('pending', { kind: 'tag', tag: 'dragons' })

    await waitFor(() => expect(listArticles).toHaveBeenCalledOnce())
    expect(replace).not.toHaveBeenCalled()
  })
})
