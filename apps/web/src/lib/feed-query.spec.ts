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
