import type { ArticlesResponse } from '@repo/shared'
import type { ApiClient } from './api-client'
import { offsetForPage } from './pagination'

/**
 * Flux d'articles : quoi charger, et sous quelle clé de cache ([ADR 015]).
 *
 * Ce module est le **point unique** que le serveur et le client partagent. Le
 * Server Component précharge avec `feedQueryKey` + `fetchFeed`, le composant
 * client interroge `useQuery` avec la même clé, et le cache est donc déjà rempli
 * au montage. Recopier la clé d'un côté produirait un cache manqué — c'est-à-dire
 * une requête au chargement, un contenu qui clignote, et aucun message d'erreur
 * pour l'expliquer.
 */

/**
 * Les flux d'articles que l'application sait afficher.
 *
 * Les trois premiers sont ceux de l'accueil (templates.md §Home) ; les deux
 * derniers ceux du profil. Un seul type pour les cinq, parce qu'ils ne diffèrent
 * que par le filtre envoyé — en faire deux familles justifierait deux
 * implémentations de liste, ce que l'ADR 015 a écarté.
 */
export type FeedKind =
  | { kind: 'global' }
  | { kind: 'following' }
  | { kind: 'tag'; tag: string }
  | { kind: 'author'; username: string }
  | { kind: 'favorited'; username: string }

export interface FeedRequest {
  readonly feed: FeedKind
  readonly page: number
}

/**
 * Détermine le flux réellement affiché.
 *
 * Le point qui compte est le repli d'AC-3 : les onglets ne proposent « Your
 * Feed » qu'à un utilisateur connecté, d'où l'on conclut trop vite que le flux
 * personnel est inatteignable autrement. Il l'est par l'URL — le contrat de
 * sélecteurs E2E décrit `/?feed=following` — et un anonyme qui la suit
 * déclencherait un appel authentifié sans jeton, verrait un 401, et une page en
 * erreur là où le comportement attendu est banal : lui montrer le flux global.
 *
 * Le tag l'emporte sur tout : il vient du chemin (`/tag/:tag`), pas d'un
 * paramètre optionnel, donc il n'est jamais ambigu.
 */
export function resolveFeed(input: {
  tag?: string | undefined
  feedParam?: string | undefined
  isAuthenticated: boolean
}): FeedKind {
  if (input.tag) {
    return { kind: 'tag', tag: input.tag }
  }

  if (input.feedParam === 'following' && input.isAuthenticated) {
    return { kind: 'following' }
  }

  return { kind: 'global' }
}

/**
 * Clé de cache d'un flux paginé.
 *
 * La page en fait partie : deux pages du même flux sont deux entrées de cache
 * distinctes, sans quoi revenir en arrière afficherait le contenu de la page
 * qu'on vient de quitter.
 */
export function feedQueryKey({ feed, page }: FeedRequest): readonly unknown[] {
  return ['articles', feed, page]
}

/**
 * Charge un flux.
 *
 * Le flux personnel passe par son **endpoint dédié** et jamais par un filtre de
 * la liste globale : router l'un vers l'autre renverrait tout le site, dans une
 * réponse parfaitement bien formée (REQ-WEB-008 AC-4).
 */
export function fetchFeed(
  client: ApiClient,
  { feed, page }: FeedRequest
): Promise<ArticlesResponse> {
  const offset = offsetForPage(page)

  if (feed.kind === 'following') {
    return client.getFeed({ offset })
  }

  return client.listArticles({ offset, ...filterFor(feed) })
}

/**
 * Filtre de liste correspondant au flux.
 *
 * `author` et `favorited` prennent tous deux un **username** : ils sont donc
 * interchangeables sans erreur de type, et les intervertir produirait une
 * réponse parfaitement bien formée — la page « mes articles » afficherait ceux
 * que le compte a favorisés, c'est-à-dire ceux d'autres personnes. Rien ne
 * planterait ; l'erreur ne se verrait qu'en lisant le contenu. D'où cette
 * correspondance écrite une seule fois, à un seul endroit.
 */
function filterFor(feed: FeedKind): { tag?: string; author?: string; favorited?: string } {
  switch (feed.kind) {
    case 'tag':
      return { tag: feed.tag }
    case 'author':
      return { author: feed.username }
    case 'favorited':
      return { favorited: feed.username }
    default:
      return {}
  }
}
