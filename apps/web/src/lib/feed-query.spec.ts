import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from './api-client'
import { feedQueryKey, fetchFeed, resolveFeed } from './feed-query'

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

describe('REQ-WEB-009 — résolution du flux affiché', () => {
  it('AC-1: sert le flux global par défaut', () => {
    expect(resolveFeed({ isAuthenticated: false })).toEqual({ kind: 'global' })
  })

  it('AC-2: sert le flux personnel à un utilisateur connecté qui le demande', () => {
    expect(resolveFeed({ feedParam: 'following', isAuthenticated: true })).toEqual({
      kind: 'following',
    })
  })

  it('AC-3: retombe sur le flux global pour un anonyme qui demande le flux personnel', () => {
    // Le cas se produit par l'URL, que le contrat de sélecteurs décrit
    // (`/?feed=following`) : les onglets ne l'offrent pas à un anonyme, mais un
    // lien partagé ou un signet y mènent. Sans repli, l'appel authentifié part
    // sans jeton et le lecteur voit une erreur là où il attend une liste.
    expect(resolveFeed({ feedParam: 'following', isAuthenticated: false })).toEqual({
      kind: 'global',
    })
  })

  it('AC-4: le tag l’emporte, y compris sur une demande de flux personnel', () => {
    // Le tag vient du chemin (`/tag/:tag`), pas d'un paramètre optionnel : il
    // n'est jamais ambigu.
    expect(resolveFeed({ tag: 'dragons', feedParam: 'following', isAuthenticated: true })).toEqual({
      kind: 'tag',
      tag: 'dragons',
    })
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

    expect(client.listArticles).toHaveBeenCalledWith({ offset: 0, tag: 'dragons' })
  })

  it('AC-1: n’envoie aucun filtre de tag sur le flux global', async () => {
    const client = clientDouble()

    await fetchFeed(client, { feed: { kind: 'global' }, page: 3 })

    // La page 3 vaut un décalage de 40 : le convertir ici plutôt que dans
    // chaque appelant évite qu'un seul oublie la conversion.
    expect(client.listArticles).toHaveBeenCalledWith({ offset: 40 })
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
    expect(client.listArticles).toHaveBeenLastCalledWith({ offset: 0, author: 'jake' })

    await fetchFeed(client, { feed: { kind: 'favorited', username: 'jake' }, page: 1 })
    expect(client.listArticles).toHaveBeenLastCalledWith({ offset: 0, favorited: 'jake' })
  })

  it('AC-4: sépare les deux onglets d’un même profil dans le cache', async () => {
    // Même username, même page : sans distinction, passer d'un onglet à l'autre
    // afficherait le contenu du précédent.
    expect(feedQueryKey({ feed: { kind: 'author', username: 'jake' }, page: 1 })).not.toEqual(
      feedQueryKey({ feed: { kind: 'favorited', username: 'jake' }, page: 1 })
    )
  })
})
