import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from './api-client'
import { feedQueryKey, fetchFeed, isPublicFeed, prefetchFeed, requestedFeed } from './feed-query'
import { WEB_PAGE_LIMIT } from './pagination'

/** Tests écrits depuis les critères de REQ-WEB-009, avant l'implémentation. */

const emptyPage = { articles: [], articlesCount: 0 }

/** Doublure du client : seules les deux méthodes de liste sont exercées ici. */
const clientDouble = () => {
  const listArticles = vi.fn().mockResolvedValue(emptyPage)
  const getFeed = vi.fn().mockResolvedValue(emptyPage)
  return { listArticles, getFeed } as unknown as ApiClient & {
    listArticles: ReturnType<typeof vi.fn>
    getFeed: ReturnType<typeof vi.fn>
  }
}

describe('REQ-WEB-009 — flux demandé par l’URL', () => {
  it('AC-1: sert le flux global par défaut', () => {
    expect(requestedFeed({})).toEqual({ kind: 'global' })
  })

  it('AC-7: rend le flux personnel dès que l’URL le demande, sans consulter la session', () => {
    // La fonction ne prend **pas** `isAuthenticated`, et c'est le point de
    // l'[ADR 022] : le serveur ne sait pas qui lit (ADR 012), donc lui faire
    // rendre un verdict d'accès revenait à faire passer le flux demandé pour le
    // flux résolu. La décision d'accès appartient à `HomeFeed`.
    expect(requestedFeed({ feedParam: 'following' })).toEqual({ kind: 'following' })
  })

  it('AC-3: ne retombe plus silencieusement sur le flux global', () => {
    // Critère amendé ([ADR 022]) : le repli vers le flux global montrait à un
    // anonyme les articles de tout le monde en lui laissant croire qu'il voyait
    // les siens. La redirection vers `/login` est prononcée par la garde
    // cliente, sur la foi de ce flux demandé.
    expect(requestedFeed({ feedParam: 'following' })).not.toEqual({ kind: 'global' })
  })

  it('AC-4: le tag l’emporte, y compris sur une demande de flux personnel', () => {
    // Le tag vient du chemin (`/tag/:tag`), pas d'un paramètre optionnel : il
    // n'est jamais ambigu.
    expect(requestedFeed({ tag: 'dragons', feedParam: 'following' })).toEqual({
      kind: 'tag',
      tag: 'dragons',
    })
  })

  it('AC-3: ne déclare public que ce qu’un appelant anonyme peut charger', () => {
    // C'est la condition du préchargement serveur (ADR 015 §4). L'écrire comme
    // une fonction plutôt que comme une vigilance est ce qui empêche une future
    // page de précharger un flux personnel sans jeton.
    expect(isPublicFeed({ kind: 'global' })).toBe(true)
    expect(isPublicFeed({ kind: 'tag', tag: 'dragons' })).toBe(true)
    expect(isPublicFeed({ kind: 'author', username: 'jake' })).toBe(true)
    expect(isPublicFeed({ kind: 'favorited', username: 'jake' })).toBe(true)
    expect(isPublicFeed({ kind: 'following' })).toBe(false)
  })

  it('AC-2: distingue les flux et les pages dans la clé de cache', () => {
    // Deux pages du même flux sont deux entrées distinctes : les confondre
    // afficherait, en revenant en arrière, le contenu de la page qu'on quitte.
    expect(feedQueryKey({ feed: { kind: 'global' }, page: 1 })).not.toEqual(
      feedQueryKey({ feed: { kind: 'global' }, page: 2 })
    )
    expect(feedQueryKey({ feed: { kind: 'global' }, page: 1 })).not.toEqual(
      feedQueryKey({ feed: { kind: 'following' }, page: 1 })
    )
    expect(feedQueryKey({ feed: { kind: 'tag', tag: 'a' }, page: 1 })).not.toEqual(
      feedQueryKey({ feed: { kind: 'tag', tag: 'b' }, page: 1 })
    )
  })

  it('AC-3: ne précharge jamais le flux personnel, même appelée directement', async () => {
    // Défense en profondeur : `home-page.tsx` conditionne déjà son appel à
    // `isPublicFeed(feed)`, mais cette garde doit survivre à un futur
    // appelant qui l'oublierait — un préchargement du flux personnel depuis
    // le client serveur anonyme ne pourrait recevoir qu'un 401 pour rien.
    const client = clientDouble()
    const queryClient = new QueryClient()

    await prefetchFeed(queryClient, client, { feed: { kind: 'following' }, page: 1 })

    expect(client.getFeed).not.toHaveBeenCalled()
    expect(client.listArticles).not.toHaveBeenCalled()
  })

  it('AC-2: charge le flux personnel par son endpoint dédié', async () => {
    const client = clientDouble()

    await fetchFeed(client, { feed: { kind: 'following' }, page: 1 })

    // Le router vers `listArticles` renverrait tout le site, dans une réponse
    // bien formée et entièrement fausse.
    expect(client.getFeed).toHaveBeenCalledOnce()
    expect(client.listArticles).not.toHaveBeenCalled()
  })

  it('AC-4: passe le tag en filtre de la liste globale', async () => {
    const client = clientDouble()

    await fetchFeed(client, { feed: { kind: 'tag', tag: 'dragons' }, page: 1 })

    expect(client.listArticles).toHaveBeenCalledWith({
      limit: WEB_PAGE_LIMIT,
      offset: 0,
      tag: 'dragons',
    })
  })

  it('AC-1: n’envoie aucun filtre de tag sur le flux global', async () => {
    const client = clientDouble()

    await fetchFeed(client, { feed: { kind: 'global' }, page: 3 })

    // La page 3 vaut un décalage de deux pages : le convertir ici plutôt que
    // dans chaque appelant évite qu'un seul oublie la conversion.
    expect(client.listArticles).toHaveBeenCalledWith({
      limit: WEB_PAGE_LIMIT,
      offset: 2 * WEB_PAGE_LIMIT,
    })
  })
})

describe('REQ-WEB-010 — taille de page demandée à l’API', () => {
  it('AC-10: envoie explicitement la taille de page du front sur chaque flux', async () => {
    // Ne pas l'envoyer laissait l'API appliquer son propre défaut (20) pendant
    // que le front comptait ses pages sur la sienne (10) : deux découpes des
    // mêmes articles, sans la moindre erreur pour le signaler ([ADR 023]).
    const client = clientDouble()

    await fetchFeed(client, { feed: { kind: 'global' }, page: 1 })
    expect(client.listArticles).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: WEB_PAGE_LIMIT })
    )

    await fetchFeed(client, { feed: { kind: 'following' }, page: 2 })
    expect(client.getFeed).toHaveBeenLastCalledWith({
      limit: WEB_PAGE_LIMIT,
      offset: WEB_PAGE_LIMIT,
    })
  })
})

/**
 * Describe distinct, et ce n'est pas une coquetterie de rangement : le
 * rattachement à une exigence se fait par le **nom du describe**. Ces deux tests
 * portaient d'abord un préfixe `AC-4:` sous le describe de REQ-WEB-009 — ils
 * prouvaient donc un critère de la page d'accueil, pendant que les critères du
 * profil restaient à découvert. Le rapport de couverture l'a signalé.
 */
describe('REQ-WEB-015 — filtres des onglets du profil', () => {
  it('AC-4: distingue « écrit par » de « favorisé par »', async () => {
    // Les deux filtres prennent un username : ils sont interchangeables sans
    // erreur de type, et les intervertir donnerait une réponse bien formée où
    // « mes articles » afficherait ceux d'autres personnes. Seul le nom du
    // paramètre les sépare — d'où deux assertions distinctes.
    const client = clientDouble()

    await fetchFeed(client, { feed: { kind: 'author', username: 'jake' }, page: 1 })
    expect(client.listArticles).toHaveBeenLastCalledWith({
      limit: WEB_PAGE_LIMIT,
      offset: 0,
      author: 'jake',
    })

    await fetchFeed(client, { feed: { kind: 'favorited', username: 'jake' }, page: 1 })
    expect(client.listArticles).toHaveBeenLastCalledWith({
      limit: WEB_PAGE_LIMIT,
      offset: 0,
      favorited: 'jake',
    })
  })

  it('AC-4: sépare les deux onglets d’un même profil dans le cache', async () => {
    // Même username, même page : sans distinction, passer d'un onglet à l'autre
    // afficherait le contenu du précédent.
    expect(feedQueryKey({ feed: { kind: 'author', username: 'jake' }, page: 1 })).not.toEqual(
      feedQueryKey({ feed: { kind: 'favorited', username: 'jake' }, page: 1 })
    )
  })
})
