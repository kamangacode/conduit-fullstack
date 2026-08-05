import { HomePage } from '../../home-page'

/**
 * Route `/tag/:tag` — même écran que `/`, filtré par tag.
 *
 * Elle ne réécrit rien : la page est partagée, et seule la provenance du tag
 * change. Deux implémentations du même écran auraient deux markups à garder
 * cohérents, ce que l'ADR 015 a explicitement écarté pour les listes.
 *
 * Le tag arrive **encodé** dans le chemin : `Next.js` ne le décode pas, et le
 * passer tel quel filtrerait sur `c%2B%2B` au lieu de `c++`.
 */
export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params
  return { title: `#${decodeURIComponent(tag)} — Conduit` }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tag } = await params

  return <HomePage tag={decodeURIComponent(tag)} searchParams={await searchParams} />
}
