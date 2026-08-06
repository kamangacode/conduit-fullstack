import { ProfilePage } from '../../profile-page'

/**
 * Route `/profile/:username` — articles publiés par ce compte.
 *
 * L'écran vit dans `profile-page.tsx`, partagé avec l'onglet des favoris : les
 * deux routes n'en diffèrent que par le filtre envoyé à l'API.
 */
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return { title: `@${decodeURIComponent(username)} — Conduit` }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { username } = await params

  return (
    <ProfilePage
      username={decodeURIComponent(username)}
      tab="author"
      searchParams={await searchParams}
    />
  )
}
