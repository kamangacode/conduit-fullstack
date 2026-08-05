import { notFound } from 'next/navigation'
import { ArticleEditor } from '../../../components/ArticleEditor'
import { ApiError, createApiClient } from '../../../lib/api-client'
import { API_BASE_URL } from '../../../lib/env'

/**
 * Route `/editor/:slug` — modification d'un article existant.
 *
 * L'article est chargé **côté serveur** : son contenu est public, et le
 * pré-remplissage doit être présent au premier rendu plutôt que d'apparaître
 * après un aller-retour, sous les doigts de l'auteur.
 *
 * L'autorisation reste côté API : un utilisateur qui ouvrirait l'éditeur sur
 * l'article d'un autre verra bien les champs — ils sont publics — mais
 * l'enregistrement sera refusé (REQ-ARTICLE-005). Masquer le formulaire ne
 * serait pas une sécurité, seulement une politesse ; l'API fait autorité.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: `Edit ${decodeURIComponent(slug)} — Conduit` }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const client = createApiClient({
    baseUrl: API_BASE_URL,
    getToken: () => null,
    fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  })

  try {
    const article = await client.getArticle(decodeURIComponent(slug))
    return <ArticleEditor article={article} />
  } catch (error) {
    // Un slug inconnu produit une vraie page introuvable ; toute autre erreur
    // remonte, pour ne pas déguiser une panne d'API en article inexistant.
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }
    throw error
  }
}
