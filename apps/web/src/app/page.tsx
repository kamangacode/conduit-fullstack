import { HomePage } from './home-page'

/**
 * Route `/` — flux global, flux personnel (`?feed=following`) et pagination
 * (`?page=N`), conformément aux routes du contrat de sélecteurs E2E.
 *
 * Le squelette de Phase 0 est remplacé ici par la composition réelle. La page
 * vit dans `home-page.tsx`, partagée avec `/tag/:tag` : les deux routes
 * affichent le même écran et ne diffèrent que par la provenance du tag.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <HomePage searchParams={await searchParams} />
}
