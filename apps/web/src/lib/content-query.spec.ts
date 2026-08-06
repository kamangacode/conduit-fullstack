import type { Article, ArticlesResponse, Comment, Profile } from '@repo/shared'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  articleQueryKey,
  commentsQueryKey,
  invalidateAuthorCaches,
  profileQueryKey,
} from './content-query'
import { feedQueryKey } from './feed-query'

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

function commentBy(username: string, id = 1): Comment {
  return {
    id,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    body: 'Un commentaire',
    author: { ...jacob, username },
  }
}

/**
 * La clé de flux vient de `feedQueryKey`, jamais recopiée à la main.
 *
 * L'écrire ici en dur laisserait les deux suites au vert le jour où la clé
 * change de forme, pendant que `invalidateAuthorCaches` cesserait d'invalider le
 * moindre flux — c'est-à-dire exactement le défaut silencieux que ce test croit
 * couvrir.
 */
const globalFeedKey = feedQueryKey({ feed: { kind: 'global' }, page: 1 })

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
    queryClient.setQueryData(globalFeedKey, feedOf('quelquun-dautre', 'jacob'))

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(globalFeedKey)?.isInvalidated).toBe(true)
  })

  it('laisse intact un flux dont aucun article n’est du compte visé', () => {
    const queryClient = newClient()
    queryClient.setQueryData(globalFeedKey, feedOf('quelquun-dautre'))

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(globalFeedKey)?.isInvalidated).toBe(false)
  })

  it('invalide un fil de commentaires où le compte visé a écrit', () => {
    // Le commentaire embarque le **même** instantané de profil que l'article
    // (`commentSchema.author` est un `profileSchema`), et `CommentSection` en
    // rend l'avatar : l'oublier laissait l'ancien avatar sous un commentaire
    // pendant tout le `staleTime` — le symptôme que AC-10 ferme.
    const queryClient = newClient()
    queryClient.setQueryData(commentsQueryKey('un-article'), [
      commentBy('quelquun-dautre', 1),
      commentBy('jacob', 2),
    ])

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(commentsQueryKey('un-article'))?.isInvalidated).toBe(true)
  })

  it('laisse intact un fil où le compte visé n’a pas écrit', () => {
    const queryClient = newClient()
    queryClient.setQueryData(commentsQueryKey('un-article'), [commentBy('quelquun-dautre')])

    invalidateAuthorCaches(queryClient, ['jacob'])

    expect(queryClient.getQueryState(commentsQueryKey('un-article'))?.isInvalidated).toBe(false)
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
