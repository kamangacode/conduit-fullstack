'use client'

import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../lib/api-client'
import { useApi } from '../lib/api-provider'
import { avatarUrl } from '../lib/avatar'
import { profileQueryKey } from '../lib/content-query'
import type { FeedKind } from '../lib/feed-query'
import { ArticlesToggle } from './ArticlesToggle'
import { FeedList } from './FeedList'
import { FollowButton } from './FollowButton'
import { ProfilePageNotice } from './ProfilePageNotice'

/**
 * Profil public (REQ-WEB-005 et REQ-WEB-015), partagé par `/profile/:username`
 * et `/profile/:username/favorites`.
 *
 * Composant **client** depuis l'[ADR 020] : le profil est demandé par le
 * navigateur, là où le rendu serveur le chargeait auparavant.
 *
 * La liste d'articles, elle, garde son préchargement serveur ([ADR 015]) : elle
 * ne dépend que du username de l'URL, donc rien n'obligeait à la déplacer, et
 * c'est le chemin par lequel arrive l'essentiel du contenu de la page.
 */

export interface ProfileViewProps {
  readonly username: string
  /** Onglet demandé par la route. */
  readonly tab: 'author' | 'favorited'
  readonly page: number
}

export function ProfileView({ username, tab, page }: ProfileViewProps) {
  const api = useApi()
  const profile = useQuery({
    queryKey: profileQueryKey(username),
    queryFn: () => api.getProfile(username),
    // Un compte inexistant est une réponse, pas une panne : la réessayer
    // retarde le message d'absence sans jamais le changer.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  })

  const feed: FeedKind = { kind: tab, username }

  if (profile.isPending) {
    // `.profile-page` **sans** `.user-info` imbriqué, pour la raison qui vaut
    // déjà pour la coquille d'erreur (REQ-WEB-018) : le contrat localise cette
    // page par `.profile-page, .user-info`, évalué en mode strict, et porter les
    // deux le rend ambigu. L'écran d'attente y est aussi exposé que la coquille
    // — un test qui arrive pendant le chargement voit celui-ci.
    return (
      <div className="profile-page">
        <div className="container">
          <div className="row">
            <div className="col-xs-12 col-md-10 offset-md-1">
              <h4>Loading profile...</h4>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (profile.isError) {
    const missing = profile.error instanceof ApiError && profile.error.status === 404
    return <ProfilePageNotice kind={missing ? 'missing' : 'unavailable'} />
  }

  return (
    <div className="profile-page">
      <div className="user-info">
        <div className="container">
          <div className="row">
            <div className="col-xs-12 col-md-10 offset-md-1">
              {/* biome-ignore lint/performance/noImgElement: le markup RealWorld attend `img.user-img` (rule 11), et l'URL est arbitraire — `next/image` exigerait de déclarer chaque hôte distant dans la configuration, ce qu'un avatar fourni par l'utilisateur rend impossible. */}
              <img
                className="user-img"
                src={avatarUrl(profile.data.image)}
                alt={profile.data.username}
              />
              <h4>{profile.data.username}</h4>
              {profile.data.bio && <p>{profile.data.bio}</p>}
              <FollowButton profile={profile.data} />
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="row">
          <div className="col-xs-12 col-md-10 offset-md-1">
            <ArticlesToggle username={profile.data.username} active={tab} />
            <FeedList
              feed={feed}
              page={page}
              pathname={pathnameFor(profile.data.username, tab)}
              searchParams={new URLSearchParams()}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Chemin courant, que la pagination doit conserver — l'onglet en fait partie. */
function pathnameFor(username: string, tab: 'author' | 'favorited'): string {
  const base = `/profile/${encodeURIComponent(username)}`
  return tab === 'favorited' ? `${base}/favorites` : base
}
