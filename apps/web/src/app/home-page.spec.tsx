import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../lib/api-client'
import { HomePage } from './home-page'

/**
 * Garde du préchargement serveur (REQ-WEB-009 AC-7, [ADR 022]).
 *
 * `HomePage` n'invoque `prefetchFeed` que `if (isPublicFeed(feed))` : le
 * serveur est anonyme (ADR 012), et un préchargement du flux personnel
 * partirait sans jeton pour revenir en 401. Cette suite exerce la condition
 * elle-même plutôt que les fonctions qu'elle protège — `isPublicFeed` et
 * `prefetchFeed` ont chacune leurs tests dans `feed-query.spec.ts`, mais rien
 * n'y garantissait jusqu'ici que `home-page.tsx` les câble correctement
 * ensemble : un `if` inversé par erreur y serait passé inaperçu.
 *
 * `HomePage` n'est jamais rendu : appelé comme une fonction async, il
 * construit son arbre d'éléments sans que React n'invoque `HomeFeed` ni
 * `PopularTags` (JSX ne fait qu'un descripteur pour les composants enfants,
 * il ne les appelle pas). Seul le client API — la seule dépendance
 * réellement *appelée* pendant l'exécution de `HomePage` — a besoin d'être
 * doublé.
 */

const emptyPage = { articles: [], articlesCount: 0 }

const clientDouble = () => {
  const listArticles = vi.fn().mockResolvedValue(emptyPage)
  const getFeed = vi.fn().mockResolvedValue(emptyPage)
  return { listArticles, getFeed } as unknown as ApiClient & {
    listArticles: ReturnType<typeof vi.fn>
    getFeed: ReturnType<typeof vi.fn>
  }
}

let client = clientDouble()

vi.mock('../lib/server-api-client', () => ({
  createServerApiClient: () => client,
}))

describe('REQ-WEB-009 — garde du préchargement serveur (ADR 022)', () => {
  beforeEach(() => {
    client = clientDouble()
  })

  it('AC-7: ne précharge pas le flux personnel demandé par `/?feed=following`', async () => {
    await HomePage({ searchParams: { feed: 'following' } })

    // Ni l'endpoint dédié ni la liste filtrée : aucun appel authentifié ne
    // part du serveur anonyme pour ce flux.
    expect(client.getFeed).not.toHaveBeenCalled()
    expect(client.listArticles).not.toHaveBeenCalled()
  })

  it('précharge le flux global, qu’un appelant anonyme peut charger', async () => {
    await HomePage({ searchParams: {} })

    expect(client.listArticles).toHaveBeenCalledOnce()
    expect(client.getFeed).not.toHaveBeenCalled()
  })

  it('précharge le flux d’un tag, également public', async () => {
    await HomePage({ tag: 'dragons', searchParams: {} })

    expect(client.listArticles).toHaveBeenCalledWith(expect.objectContaining({ tag: 'dragons' }))
    expect(client.getFeed).not.toHaveBeenCalled()
  })
})
