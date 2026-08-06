'use client'

import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../lib/api-client'
import { useApi } from '../lib/api-provider'
import { articleQueryKey } from '../lib/content-query'
import { ArticleEditor } from './ArticleEditor'
import { ArticlePageNotice } from './ArticlePageNotice'

/**
 * Chargement de l'article à modifier (REQ-WEB-014, route `/editor/:slug`).
 *
 * Composant **client** depuis l'[ADR 020]. Il ne fait que charger : la saisie,
 * la validation et l'enregistrement restent dans `ArticleEditor`, qui reçoit un
 * article déjà résolu et n'a donc aucun état de chargement à porter.
 *
 * La clé de cache est **celle de la page article** : ouvrir l'éditeur juste
 * après avoir lu l'article ne redemande rien, et modifier l'article met à jour
 * les deux vues. Une clé propre à l'éditeur aurait produit deux copies de la
 * même ressource, qui divergent dès la première modification.
 *
 * L'autorisation reste côté API : un utilisateur qui ouvrirait l'éditeur sur
 * l'article d'un autre verra bien les champs — ils sont publics — mais
 * l'enregistrement sera refusé (REQ-ARTICLE-005). Masquer le formulaire ne
 * serait pas une sécurité, seulement une politesse ; l'API fait autorité.
 */
export function ArticleEditorLoader({ slug }: { readonly slug: string }) {
  const api = useApi()
  const article = useQuery({
    queryKey: articleQueryKey(slug),
    queryFn: () => api.getArticle(slug),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  })

  if (article.isPending) {
    // Aucun champ rendu tant que l'article n'est pas là : un formulaire vide
    // qui se remplit sous les doigts de l'auteur écraserait ce qu'il vient de
    // saisir, et c'est le seul écran de cette application où l'attente a une
    // conséquence destructrice.
    return (
      <div className="editor-page">
        <div className="container page">
          <p>Loading article...</p>
        </div>
      </div>
    )
  }

  if (article.isError) {
    const missing = article.error instanceof ApiError && article.error.status === 404
    return <ArticlePageNotice kind={missing ? 'missing' : 'unavailable'} />
  }

  return <ArticleEditor article={article.data} />
}
