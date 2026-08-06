import { ProfilePage } from '../../profile-page'

/**
 * Route `/profile/:username` — articles publiés par ce compte.
 *
 * L'écran vit dans `profile-page.tsx`, partagé avec l'onglet des favoris : les
 * deux routes n'en diffèrent que par le filtre envoyé à l'API.
 *
 * `username` n'est **pas** redécodé ici : Next.js décode déjà chaque segment
 * dynamique avant de peupler `params` (`getRouteMatcher`, App Router). Un
 * second `decodeURIComponent` sur une valeur déjà décodée est un no-op tant
 * qu'elle ne contient aucun `%` littéral — mais un compte dont le nom en porte
 * un (ex. `50%off`, arrivé ici encodé une fois en `50%25off` puis décodé une
 * fois par Next en `50%off`) plante cette page : `%of` n'est pas une séquence
 * d'échappement valide. Défaut réel, trouvé en revue sur REQ-WEB-004 AC-8.
 */
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return { title: `@${username} — Conduit` }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { username } = await params

  return <ProfilePage username={username} tab="author" searchParams={await searchParams} />
}
