import { ArticleView } from '../../../components/ArticleView'

/**
 * Route `/article/:slug` (REQ-WEB-012).
 *
 * Adaptateur de deux lignes depuis l'[ADR 020] : l'article et ses commentaires
 * sont désormais demandés **par le navigateur**, et tout ce que cette page
 * rendait vit dans `ArticleView` — avec sa spec.
 *
 * Le titre de l'onglet est **dérivé du slug** et n'interroge plus l'API. Il
 * était auparavant le titre réel de l'article, au prix d'un aller-retour serveur
 * ; garder cet appel pour la seule barre d'onglet aurait laissé la moitié de la
 * page dépendre d'un chargement serveur que l'ADR 020 vient d'écarter, et
 * l'échec de cet appel aurait de nouveau tout emporté. Le slug dérive du titre
 * (règle R-1), il en reste donc une approximation lisible.
 *
 * `slug` n'est pas redécodé : voir le commentaire de `/profile/:username`, même
 * défaut, même raison. Il y est ici latent plutôt qu'atteignable — un slug est
 * réduit à `[a-z0-9-]` par `apps/api/src/domain/article/slug.ts`, donc il ne
 * porte pas de `%` aujourd'hui. Le corriger quand même : l'invariant tient pour
 * tous les segments dynamiques ou pour aucun, et le laisser à moitié appliqué
 * est précisément ce qui a fait subsister ce défaut sur trois routes.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: `${slug} — Conduit` }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return <ArticleView slug={slug} />
}
