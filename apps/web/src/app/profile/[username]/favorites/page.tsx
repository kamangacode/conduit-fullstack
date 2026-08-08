import { ProfilePage } from '../../../profile-page'

/**
 * Route `/profile/:username/favorites` — articles favorisés par ce compte.
 *
 * Même écran que `/profile/:username`, au filtre près. Le contrat de sélecteurs
 * E2E décrit cette route explicitement : elle doit exister comme URL, pas
 * seulement comme état d'un onglet.
 *
 * `username` n'est pas redécodé : voir le commentaire de `/profile/:username`,
 * même défaut, même raison.
 */
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return { title: `@${username} — Favorited — Conduit` }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { username } = await params

  return <ProfilePage username={username} tab="favorited" searchParams={await searchParams} />
}
