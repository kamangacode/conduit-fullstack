import { ArticleEditorLoader } from '../../../components/ArticleEditorLoader'

/**
 * Route `/editor/:slug` — modification d'un article existant (REQ-WEB-014).
 *
 * Adaptateur de deux lignes depuis l'[ADR 020] : l'article est demandé par le
 * navigateur, et le chargement — avec ses états d'attente et d'échec — vit dans
 * `ArticleEditorLoader`.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: `Edit ${decodeURIComponent(slug)} — Conduit` }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <ArticleEditorLoader slug={decodeURIComponent(slug)} />
}
