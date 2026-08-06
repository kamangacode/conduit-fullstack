import { HomePage } from '../../home-page'

/**
 * Route `/tag/:tag` — même écran que `/`, filtré par tag.
 *
 * Elle ne réécrit rien : la page est partagée, et seule la provenance du tag
 * change. Deux implémentations du même écran auraient deux markups à garder
 * cohérents, ce que l'ADR 015 a explicitement écarté pour les listes.
 *
 * `tag` n'est pas redécodé : voir le commentaire de `/profile/:username`, même
 * défaut, même raison. Il y est ici **atteignable** et non latent : `tagSchema`
 * ne nettoie rien (`z.string().trim().min(1)`), donc un tag `100%` existe,
 * `PopularTags` le lie en `/tag/100%25`, Next le redonne `100%` — et un second
 * décodage y lèverait `URIError: URI malformed`, qui emporte le rendu serveur.
 */
export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params
  return { title: `#${tag} — Conduit` }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tag } = await params

  return <HomePage tag={tag} searchParams={await searchParams} />
}
