import type { Profile } from '@repo/shared'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { notFound } from 'next/navigation'
import { ArticlesToggle } from '../components/ArticlesToggle'
import { FeedList } from '../components/FeedList'
import { FollowButton } from '../components/FollowButton'
import { ApiError, createApiClient } from '../lib/api-client'
import { avatarUrl } from '../lib/avatar'
import { API_BASE_URL } from '../lib/env'
import { type FeedKind, feedQueryKey, fetchFeed } from '../lib/feed-query'
import { pageFromParam } from '../lib/pagination'

/**
 * Page de profil (REQ-WEB-005 et REQ-WEB-015), partagée par
 * `/profile/:username` et `/profile/:username/favorites`.
 *
 * Les deux routes affichent le **même** écran et ne diffèrent que par l'onglet
 * actif — donc par le filtre envoyé à l'API. Les écrire deux fois donnerait deux
 * markups à garder cohérents, motif écarté par l'[ADR 015].
 *
 * **Server Component** : le profil et ses listes sont publics. L'appel part sans
 * jeton, donc `following` vaut `false` dans ce premier rendu, ce que la règle
 * R-5 prescrit pour un lecteur non identifié ; `FollowButton` le résout ensuite
 * côté client (ADR 012).
 */

export interface ProfilePageProps {
  readonly username: string
  /** Onglet demandé par la route. */
  readonly tab: 'author' | 'favorited'
  readonly searchParams: Record<string, string | string[] | undefined>
}

export async function ProfilePage({ username, tab, searchParams }: ProfilePageProps) {
  const profile = await fetchProfile(username)

  // Un username inconnu produit une vraie 404, pas un profil vide
  // (REQ-WEB-005 AC-6).
  if (!profile) {
    notFound()
  }

  const page = pageFromParam(firstValue(searchParams.page))
  const feed: FeedKind = { kind: tab, username: profile.username }

  const queryClient = new QueryClient()
  await prefetchArticles(queryClient, feed, page)

  return (
    <div className="profile-page">
      <div className="user-info">
        <div className="container">
          <div className="row">
            <div className="col-xs-12 col-md-10 offset-md-1">
              {/* biome-ignore lint/performance/noImgElement: le markup RealWorld attend `img.user-img` (rule 11), et l'URL est arbitraire — `next/image` exigerait de déclarer chaque hôte distant dans la configuration, ce qu'un avatar fourni par l'utilisateur rend impossible. */}
              <img className="user-img" src={avatarUrl(profile.image)} alt={profile.username} />
              <h4>{profile.username}</h4>
              {profile.bio && <p>{profile.bio}</p>}
              <FollowButton profile={profile} />
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="row">
          <div className="col-xs-12 col-md-10 offset-md-1">
            <ArticlesToggle username={profile.username} active={tab} />
            <HydrationBoundary state={dehydrate(queryClient)}>
              <FeedList
                feed={feed}
                page={page}
                pathname={pathnameFor(profile.username, tab)}
                searchParams={new URLSearchParams()}
              />
            </HydrationBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Charge le profil, ou `null` s'il n'existe pas.
 *
 * Un 404 est un résultat attendu ; toute autre erreur remonte, pour ne pas
 * déguiser une API en rade en « profil introuvable ».
 */
async function fetchProfile(username: string): Promise<Profile | null> {
  try {
    return await client().getProfile(username)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/** Précharge la liste sans faire échouer la page si l'API est en rade (ADR 015). */
async function prefetchArticles(
  queryClient: QueryClient,
  feed: FeedKind,
  page: number
): Promise<void> {
  const api = client()

  try {
    await queryClient.prefetchQuery({
      queryKey: feedQueryKey({ feed, page }),
      queryFn: () => fetchFeed(api, { feed, page }),
    })
  } catch {
    // Le client reprendra la requête et dira l'échec s'il persiste.
  }
}

/** Client anonyme : le serveur n'a pas la session (ADR 012). */
function client() {
  return createApiClient({
    baseUrl: API_BASE_URL,
    getToken: () => null,
    fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  })
}

/** Chemin courant, que la pagination doit conserver — l'onglet en fait partie. */
function pathnameFor(username: string, tab: 'author' | 'favorited'): string {
  const base = `/profile/${encodeURIComponent(username)}`
  return tab === 'favorited' ? `${base}/favorites` : base
}

/** Voir `home-page.tsx` : Next.js rend `string | string[]`. */
function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}
