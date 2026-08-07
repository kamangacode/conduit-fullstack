import type { Article, User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { ArticleView } from './ArticleView'

/**
 * Tests de REQ-WEB-012, repris de `app/article/[slug]/page.spec.tsx`.
 *
 * La page est devenue un adaptateur de deux lignes ([ADR 020]) : ce qu'elle
 * rendait s'éprouve désormais ici, au niveau du composant qui charge et rend
 * réellement. Deux critères ont changé de sens dans l'opération et sont
 * réécrits plutôt que déplacés — voir AC-7 et AC-8.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const getArticle = vi.hoisted(() => vi.fn())
const getComments = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({
  useApi: () => ({ getArticle, getComments, addComment: vi.fn(), deleteComment: vi.fn() }),
}))

// La méta est un composant client à part entière, avec sa propre spec : la
// monter ici ferait échouer ces tests pour une raison sans rapport.
vi.mock('./ArticleMeta', () => ({ ArticleMeta: () => <div className="article-meta" /> }))

const article: Article = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: '# Introduction\n\nIt takes a **Jacobian**.',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jacob', bio: null, image: null, following: false },
}

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const renderView = (
  slug = 'how-to-train-your-dragon',
  fetchCurrentUser: (token: string) => Promise<User> = () => Promise.reject(new ApiError(401, {}))
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <SessionProvider fetchCurrentUser={fetchCurrentUser}>
        <ArticleView slug={slug} />
      </SessionProvider>
    </QueryClientProvider>
  )

beforeEach(() => {
  window.localStorage.clear()
  getArticle.mockReset().mockResolvedValue(article)
  getComments.mockReset().mockResolvedValue([])
})

describe('REQ-WEB-012 — page article', () => {
  it('AC-1: rend le titre, les tags et le markup du template', async () => {
    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('.article-content')).not.toBeNull())
    expect(container.querySelector('.article-page .banner h1')).toHaveTextContent(
      'How to train your dragon'
    )
    expect(container.querySelectorAll('.tag-list li')).toHaveLength(2)
  })

  it('AC-1: répète la méta après le corps, comme le template', async () => {
    // Le lecteur arrive là en finissant l'article : c'est le moment où il
    // décide de suivre l'auteur.
    const { container } = renderView()

    await waitFor(() => expect(container.querySelectorAll('.article-meta')).toHaveLength(2))
    expect(container.querySelector('.article-actions')).not.toBeNull()
  })

  it('AC-2: rend le corps Markdown mis en forme', async () => {
    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('.article-content h1')).not.toBeNull())
    expect(container.querySelector('.article-content h1')).toHaveTextContent('Introduction')
    expect(container.querySelector('.article-content strong')).toHaveTextContent('Jacobian')
  })

  it('AC-1: rend la section des commentaires sous l’article', async () => {
    getComments.mockResolvedValue([])

    renderView()

    // Session anonyme dans ce test : la section montre alors l'invitation à se
    // connecter plutôt que le formulaire (REQ-WEB-013). C'est bien elle qui est
    // rendue, et c'est ce que ce critère vérifie ici. L'invite n'est plus un
    // lien depuis REQ-WEB-013 AC-8 — la barre porte déjà `/login`, et le contrat
    // de sélecteurs n'en admet qu'un par page.
    await waitFor(() =>
      expect(screen.getByText(/Sign in or sign up to add comments/)).toBeInTheDocument()
    )
  })

  it('AC-1: n’affiche l’écran d’attente sous aucune classe que le contrat compte', () => {
    // Le contrat conclut à la présence du contenu par `.article-content`. Un
    // écran d'attente qui la porterait ferait passer une page vide pour un
    // article rendu — motif déjà rencontré sur l'indicateur de chargement des
    // listes, qui portait `.article-preview`.
    getArticle.mockReturnValue(new Promise(() => {}))

    const { container } = renderView()

    expect(container.querySelector('.article-page')).not.toBeNull()
    expect(container.querySelector('.article-content')).toBeNull()
    expect(container.querySelector('.article-preview')).toBeNull()
  })

  it('AC-7: rend la coquille « article introuvable » sur un slug inconnu', async () => {
    // Le critère disait « une vraie page introuvable », c'est-à-dire un statut
    // HTTP 404. Le chargement client l'a rendu impossible — le serveur a déjà
    // répondu quand l'absence est connue — et l'[ADR 020] l'assume : ce qui
    // reste opposable est ce que le lecteur voit.
    getArticle.mockRejectedValue(new ApiError(404, {}))

    renderView('fantome')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Article not found' })).toBeInTheDocument()
    )
  })

  it('AC-8: distingue une panne d’API d’un article absent', async () => {
    // « Cet article n'existe pas » affiché pendant une panne est un message
    // faux, au moment où il coûte le plus cher au lecteur.
    getArticle.mockRejectedValue(new ApiError(500, {}))

    renderView()

    // Délai élargi : une panne est réessayée une fois, contrairement au 404 —
    // un article absent le restera, une API en difficulté peut répondre au coup
    // suivant. C'est cette asymétrie qui allonge le chemin jusqu'au message.
    await waitFor(
      () =>
        expect(screen.getByRole('heading', { name: 'Article unavailable' })).toBeInTheDocument(),
      { timeout: 3000 }
    )
    expect(screen.queryByRole('heading', { name: 'Article not found' })).not.toBeInTheDocument()
  })

  it('AC-8: une panne des commentaires n’emporte pas l’article', async () => {
    // Deux requêtes distinctes, donc deux échecs indépendants : l'article est
    // l'essentiel de la page, et l'indisponibilité des commentaires ne doit pas
    // l'emporter.
    getComments.mockRejectedValue(new Error('réseau'))

    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('.article-content')).not.toBeNull())
    expect(container.querySelector('.article-page .banner h1')).toHaveTextContent(
      'How to train your dragon'
    )
  })
})

/**
 * La page article porte deux champs relatifs au lecteur — `favorited` et
 * `author.following` (règle R-5) — donc exactement la propriété que
 * REQ-WEB-005 AC-7 énonce, sur une seconde surface. Le critère est écrit une
 * fois et éprouvé partout où il s'applique ; le redoubler dans REQ-WEB-012
 * créerait deux formulations à garder d'accord.
 */
describe('REQ-WEB-005 — requête relative au lecteur, sur la page article', () => {
  it('AC-7: n’émet aucune requête d’article tant que la session n’a pas résolu son jeton', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    let resolveUser: (user: User) => void = () => undefined
    const fetchCurrentUser = vi.fn(
      () =>
        new Promise<User>((resolve) => {
          resolveUser = resolve
        })
    )

    renderView('how-to-train-your-dragon', fetchCurrentUser)

    await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledWith(jake.token))
    expect(getArticle).not.toHaveBeenCalled()

    resolveUser(jake)

    await waitFor(() => expect(getArticle).toHaveBeenCalledOnce())
  })

  it('AC-7: ne retarde pas les commentaires, qui ne dépendent pas du lecteur', async () => {
    // La garde est **ciblée**. L'étendre à toute la page ajouterait
    // l'aller-retour `GET /user` au chemin critique d'un contenu public, pour
    // corriger un champ que ce contenu ne porte pas.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    const fetchCurrentUser = vi.fn(() => new Promise<User>(() => undefined))

    renderView('how-to-train-your-dragon', fetchCurrentUser)

    await waitFor(() => expect(getComments).toHaveBeenCalledWith('how-to-train-your-dragon'))
    expect(getArticle).not.toHaveBeenCalled()
  })
})
