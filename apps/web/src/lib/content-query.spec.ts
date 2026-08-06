import type { Article, ArticlesResponse, Profile } from '@repo/shared'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { articleQueryKey, invalidateAuthorCaches, profileQueryKey } from './content-query'

/**
 * Tests de REQ-WEB-004 AC-10, côté cache plutôt que côté page : la politique
 * (quelles clés un compte modifié rend périmées) vit ici, `page.spec.tsx`
 * n'en éprouve plus que l'ordre d'appel depuis `applyChanges`.
 */

const jacob: Profile = { username: 'jacob', bio: null, image: null, following: false }

function articleBy(username: string, slug = 'un-article'): Article {
  return {
    slug,
    title: 'Un article',
    description: '…',
    body: '…',
    tagList: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    favorited: false,
    favoritesCount: 0,
    author: { ...jacob, username },
  }
}

function feedOf(...usernames: string[]): ArticlesResponse {
  return {
    articles: usernames.map((username, index) => articleBy(username, `article-${index}`)),
    articlesCount: usernames.length,
  }
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('REQ-WEB-004 AC-10 — invalidateAuthorCaches', () => {
  it('invalide la clé de profil de chacun des usernames visés', () => {
    const queryClient = newClient()
    queryClient.setQueryData(profileQueryKey('jacob'), jacob)
    queryClient.setQueryData(profileQueryKey('jacob-renomme'), {
      ...jacob,
      username: 'jacob-renomme',
    })

    invalidateAuthorCaches(queryClient, ['jacob', 'jacob-renomme'])

    expect(queryClient.getQueryState(profileQueryKey('jacob'))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(profileQueryKey('jacob-renomme'))?.isInvalidated).toBe(true)
  })

  it('invalide le détail d’un article dont le compte visé est l’auteur', () => {
    const queryClient = newClient()
    queryClient.setQueryData(articleQueryKey('un-article'), articleBy('jacob'))

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(articleQueryKey('un-article'))?.isInvalidated).toBe(true)
  })

  it('laisse intact le détail d’un article écrit par quelqu’un d’autre', () => {
    // Le contraire serait une invalidation trop large : tout le monde qui
    // enregistre ses paramètres viderait le cache d'articles d'autrui.
    const queryClient = newClient()
    queryClient.setQueryData(articleQueryKey('un-article'), articleBy('quelquun-dautre'))

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(articleQueryKey('un-article'))?.isInvalidated).toBe(false)
  })

  it('invalide un flux qui contient au moins un article du compte visé', () => {
    // Le défaut que ce test ferme : un article n'apparaît pas seul en cache,
    // il apparaît aussi dans les listes (accueil, profil) qui l'embarquent —
    // le même instantané d'auteur y est dupliqué par l'API.
    const queryClient = newClient()
    const feedKey = ['articles', { kind: 'global' }, 1]
    queryClient.setQueryData(feedKey, feedOf('quelquun-dautre', 'jacob'))

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(feedKey)?.isInvalidated).toBe(true)
  })

  it('laisse intact un flux dont aucun article n’est du compte visé', () => {
    const queryClient = newClient()
    const feedKey = ['articles', { kind: 'global' }, 1]
    queryClient.setQueryData(feedKey, feedOf('quelquun-dautre'))

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(feedKey)?.isInvalidated).toBe(false)
  })

  it('ne plante pas sur une entrée jamais chargée', () => {
    // `articleQueryKey`/`feedQueryKey` existent pour une requête qui n'a pas
    // encore reçu de réponse (montage en cours) : `state.data` y vaut
    // `undefined`, et ce n'est pas une entrée à invalider — elle n'a rien à
    // périmer.
    const queryClient = newClient()
    queryClient.prefetchQuery({
      queryKey: articleQueryKey('en-cours'),
      queryFn: () => new Promise<Article>(() => {}),
    })

    expect(() => invalidateAuthorCaches(queryClient, ['jacob'])).not.toThrow()
  })
})
