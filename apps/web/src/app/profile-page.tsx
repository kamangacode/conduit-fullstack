import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { ProfileView } from '../components/ProfileView'
import { type FeedKind, prefetchFeed } from '../lib/feed-query'
import { pageFromParam } from '../lib/pagination'
import { createServerApiClient } from '../lib/server-api-client'

/**
 * Page de profil (REQ-WEB-005 et REQ-WEB-015), partagée par
 * `/profile/:username` et `/profile/:username/favorites`.
 *
 * Les deux routes affichent le **même** écran et ne diffèrent que par l'onglet
 * actif — donc par le filtre envoyé à l'API. Les écrire deux fois donnerait deux
 * markups à garder cohérents, motif écarté par l'[ADR 015].
 *
 * Depuis l'[ADR 020], ce module ne charge plus le profil : `ProfileView` le
 * demande au navigateur. Il reste responsable du **préchargement de la liste
 * d'articles**, qui ne dépend que du username de l'URL — pas de la réponse du
 * profil — et qui porte l'essentiel du contenu de la page.
 *
 * Le préchargement part **sans jeton** : `favorited` vaut donc `false` dans le
 * cache transmis, ce que la règle R-5 prescrit pour un lecteur non identifié.
 */

export interface ProfilePageProps {
  readonly username: string
  /** Onglet demandé par la route. */
  readonly tab: 'author' | 'favorited'
  readonly searchParams: Record<string, string | string[] | undefined>
}

export async function ProfilePage({ username, tab, searchParams }: ProfilePageProps) {
  const page = pageFromParam(firstValue(searchParams.page))
  const feed: FeedKind = { kind: tab, username }

  const queryClient = new QueryClient()
  await prefetchFeed(queryClient, createServerApiClient(), { feed, page })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProfileView username={username} tab={tab} page={page} />
    </HydrationBoundary>
  )
}

/** Voir `home-page.tsx` : Next.js rend `string | string[]`. */
function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}
