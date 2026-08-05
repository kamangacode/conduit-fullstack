import type { Profile } from '@repo/shared'
import { notFound } from 'next/navigation'
import { FollowButton } from '../../../components/FollowButton'
import { ApiError, createApiClient } from '../../../lib/api-client'
import { API_BASE_URL } from '../../../lib/env'

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

/**
 * Charge le profil côté serveur, **par le même client** que le navigateur.
 *
 * Ce fichier avait sa propre implémentation : URL de base, construction du
 * chemin et déballage de l'enveloppe recopiés. Trois occasions de diverger pour
 * un endpoint que la rule 10 confie explicitement à `api-client.ts`. Rien ici
 * n'est propre au serveur — le client n'a aucune dépendance au navigateur.
 *
 * `getToken: () => null` **est** la décision de l'ADR 012 rendue explicite : le
 * rendu serveur est anonyme, donc `following` vaut `false`, ce que R-5 prescrit
 * pour un lecteur non identifié.
 *
 * `cache: 'no-store'` : un profil change (bio, image), et servir une version
 * mise en cache afficherait un état périmé juste après une modification dans
 * les paramètres.
 */
async function fetchProfile(username: string): Promise<Profile | null> {
  const client = createApiClient({
    baseUrl: API_BASE_URL,
    getToken: () => null,
    fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  })

  try {
    return await client.getProfile(username)
  } catch (error) {
    // Un username inconnu répond 404 : c'est un résultat attendu, pas une
    // panne. Toute autre erreur remonte, pour ne pas déguiser une API en rade
    // en « profil introuvable ».
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
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
