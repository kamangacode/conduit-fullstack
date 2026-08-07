import type { Article, ArticlesResponse, Comment, Profile } from '@repo/shared'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  articleQueryKey,
  cacheSavedArticle,
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

/**
 * Tests de REQ-WEB-014 AC-8 et AC-10, côté cache.
 *
 * Ce que le helper doit rendre vrai est une propriété du modèle de cache — quelle
 * entrée un enregistrement rend fausse — et non un comportement de l'éditeur.
 * `ArticleEditor.spec.tsx` n'en éprouve que le câblage : que l'éditeur l'appelle,
 * avec le bon slug d'origine, et avant la redirection.
 */
describe('REQ-WEB-014 AC-8/AC-10 — cacheSavedArticle', () => {
  /** Un article étiqueté, tel que le chargeur de l'éditeur l'écrit à l'ouverture. */
  const tagged = (slug: string): Article => ({
    ...articleBy('jacob', slug),
    tagList: ['test', 'playwright'],
  })

  it('AC-8: écrit l’article renvoyé sous la clé de son propre slug', () => {
    const queryClient = newClient()

    cacheSavedArticle(queryClient, articleBy('jacob', 'un-article'))

    expect(queryClient.getQueryData(articleQueryKey('un-article'))).toEqual(
      articleBy('jacob', 'un-article')
    )
  })

  it('AC-9: remplace l’entrée d’avant l’enregistrement, à slug inchangé', () => {
    // Le cœur du défaut mesuré (`articles.spec.ts:229`). L'entrée pré-remplie
    // reproduit exactement ce que `ArticleEditorLoader` écrit à l'ouverture de
    // l'éditeur : sans elle, le test passerait contre le code d'avant, une
    // clé absente étant de toute façon chargée depuis l'API.
    const queryClient = newClient()
    queryClient.setQueryData(articleQueryKey('un-article'), tagged('un-article'))
    const saved: Article = { ...tagged('un-article'), tagList: [] }

    cacheSavedArticle(queryClient, saved, 'un-article')

    expect(queryClient.getQueryData<Article>(articleQueryKey('un-article'))?.tagList).toEqual([])
  })

  it('AC-10: retire l’entrée du slug d’origine quand l’enregistrement l’a changé', () => {
    // La ressource n'existe plus sous l'ancien slug — l'API y répond 404. Une
    // entrée fraîche qui la décrirait encore servirait un article fantôme à qui
    // reviendrait en arrière.
    const queryClient = newClient()
    queryClient.setQueryData(articleQueryKey('ancien-slug'), tagged('ancien-slug'))

    cacheSavedArticle(queryClient, articleBy('jacob', 'nouveau-slug'), 'ancien-slug')

    expect(queryClient.getQueryData(articleQueryKey('ancien-slug'))).toBeUndefined()
    expect(queryClient.getQueryData(articleQueryKey('nouveau-slug'))).toBeDefined()
  })

  it('AC-10: ne retire rien quand le slug n’a pas changé', () => {
    // Le pendant indispensable du test précédent : un retrait inconditionnel
    // effacerait l'entrée que la ligne d'avant vient d'écrire, et la page
    // atteinte repartirait en chargement — l'inverse de ce que AC-8 demande.
    const queryClient = newClient()
    const saved: Article = { ...tagged('un-article'), tagList: [] }

    cacheSavedArticle(queryClient, saved, 'un-article')

    expect(queryClient.getQueryData(articleQueryKey('un-article'))).toEqual(saved)
  })

  it('AC-8: en création, n’efface aucune entrée faute de slug d’origine', () => {
    // Une création n'a pas d'article de départ : l'appel se fait sans troisième
    // argument, et `undefined` ne doit pas être pris pour un slug à retirer.
    const queryClient = newClient()
    queryClient.setQueryData(articleQueryKey('un-autre-article'), tagged('un-autre-article'))

    cacheSavedArticle(queryClient, articleBy('jacob', 'nouvel-article'))

    expect(queryClient.getQueryData(articleQueryKey('un-autre-article'))).toBeDefined()
    expect(queryClient.getQueryData(articleQueryKey('nouvel-article'))).toBeDefined()
  })
})
