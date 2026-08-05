import type { Profile, ProfileResponse } from '@repo/shared'
import { notFound } from 'next/navigation'
import { FollowButton } from '../../../components/FollowButton'

/**
 * Page de profil public (REQ-WEB-005, route `/profile/:username`).
 *
 * **Server Component** : le contenu — username, bio, image — est identique pour
 * tout le monde, donc rendu côté serveur et référençable. Seul le bouton de
 * suivi dépend du lecteur et bascule côté client
 * ([ADR 012](../../../../../docs/adr/012-rendu-hybride-et-session-client.md)).
 *
 * L'appel part **sans jeton** : le serveur n'a pas la session. `following` vaut
 * donc `false` dans ce premier rendu, ce qui n'est pas un pis-aller mais
 * exactement ce que la règle R-5 prescrit pour un lecteur non identifié.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

/**
 * Charge le profil côté serveur.
 *
 * `cache: 'no-store'` : un profil peut changer (bio, image), et servir une
 * version mise en cache ferait afficher un état périmé après une modification
 * dans les paramètres. La page reste rendue à la demande.
 */
async function fetchProfile(username: string): Promise<Profile | null> {
  const response = await fetch(`${API_BASE_URL}/profiles/${encodeURIComponent(username)}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const { profile } = (await response.json()) as ProfileResponse
  return profile
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return { title: `@${username} — Conduit` }
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const profile = await fetchProfile(username)

  // Un username inconnu produit une vraie 404, pas un profil vide
  // (REQ-WEB-005 AC-6).
  if (!profile) {
    notFound()
  }

  return (
    <div className="profile-page">
      <div className="user-info">
        <div className="container">
          <div className="row">
            <div className="col-xs-12 col-md-10 offset-md-1">
              {profile.image && (
                // biome-ignore lint/performance/noImgElement: le markup RealWorld attend `img.user-img` (rule 11), et l'URL est arbitraire — `next/image` exigerait de déclarer chaque hôte distant dans la configuration, ce qu'un avatar fourni par l'utilisateur rend impossible.
                <img className="user-img" src={profile.image} alt={profile.username} />
              )}
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
            {/* Les onglets « My Articles » / « Favorited Articles » listent des
                articles : ils arrivent avec les listes de la slice F5. */}
            <div className="articles-toggle" />
          </div>
        </div>
      </div>
    </div>
  )
}
