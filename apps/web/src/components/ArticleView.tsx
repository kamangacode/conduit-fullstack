'use client'

import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../lib/api-client'
import { useApi } from '../lib/api-provider'
import { articleQueryKey, commentsQueryKey } from '../lib/content-query'
import { useSession } from '../lib/session'
import { ArticleBody } from './ArticleBody'
import { ArticleMeta } from './ArticleMeta'
import { ArticlePageNotice } from './ArticlePageNotice'
import { CommentSection } from './CommentSection'

/**
 * Page article (REQ-WEB-012, route `/article/:slug`).
 *
 * Composant **client** depuis l'[ADR 020] : l'article et ses commentaires sont
 * demandés par le navigateur, là où le rendu serveur les chargeait auparavant.
 * Le contenu quitte donc le HTML initial — c'est le prix nommé par l'ADR, et la
 * contrepartie est un seul chemin de données au lieu de deux.
 *
 * L'appel part avec le jeton du lecteur quand il en a un : `favorited` et
 * `following` sont relatifs à lui (règle R-5), et c'est précisément ce que le
 * rendu serveur anonyme ne pouvait pas produire.
 *
 * Encore faut-il qu'il y ait un jeton à envoyer **au moment où l'appel part**.
 * C'est la même garde que sur la page de profil (REQ-WEB-005 AC-7) : montée
 * pendant `pending`, la requête part anonyme et l'entrée de cache qu'elle
 * remplit n'est jamais reprise — la clé ne porte pas l'identité du lecteur,
 * `staleTime` vaut trente secondes et le refetch au focus est désactivé.
 */

export function ArticleView({ slug }: { readonly slug: string }) {
  const api = useApi()
  const { status } = useSession()

  const article = useQuery({
    queryKey: articleQueryKey(slug),
    queryFn: () => api.getArticle(slug),
    // Voir `ProfileView` : `pending` est le seul état où l'on ne sait pas encore
    // quel jeton envoyer, donc le seul où attendre a un sens.
    enabled: status !== 'pending',
    // Un article inexistant est une **réponse**, pas une panne : réessayer trois
    // fois un 404 retarde l'affichage du message d'absence sans rien changer à
    // son contenu.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  })

  // Chargés en parallèle de l'article, et non à sa suite : les commentaires sont
  // publics et leur requête ne dépend que du slug de l'URL. Les enchaîner
  // ajouterait un aller-retour pour rien.
  //
  // Et **sans** la garde de session ci-dessus, pour la même raison : rien dans
  // la réponse ne dépend du lecteur, donc la retarder ne corrigerait aucun
  // champ — elle ne ferait qu'ajouter l'aller-retour `GET /user` au chemin
  // critique d'un contenu public.
  const comments = useQuery({
    queryKey: commentsQueryKey(slug),
    queryFn: () => api.getComments(slug),
  })

  if (article.isPending) {
    // La coquille de chargement ne porte **ni** `.article-content` **ni**
    // `.article-preview` : le contrat de sélecteurs les cherche pour décider que
    // le contenu est là, et les porter ici ferait passer un écran d'attente pour
    // un article rendu.
    return (
      <div className="article-page">
        <div className="banner">
          <div className="container">
            <h1>Loading article...</h1>
          </div>
        </div>
      </div>
    )
  }

  if (article.isError) {
    // « Absent » et « indisponible » ne se confondent pas : afficher « cet
    // article n'existe pas » pendant une panne d'API est faux au moment où
    // c'est le plus coûteux (REQ-WEB-018).
    const missing = article.error instanceof ApiError && article.error.status === 404
    return <ArticlePageNotice kind={missing ? 'missing' : 'unavailable'} />
  }

  return (
    <div className="article-page">
      <div className="banner">
        <div className="container">
          <h1>{article.data.title}</h1>
          <ArticleMeta article={article.data} />
        </div>
      </div>

      <div className="container page">
        <div className="row article-content">
          <div className="col-md-12">
            <ArticleBody body={article.data.body} />
            <ul className="tag-list">
              {article.data.tagList.map((tag) => (
                <li className="tag-default tag-pill tag-outline" key={tag}>
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <hr />

        {/* Le template répète la méta après le corps : c'est là que le lecteur
            arrive en finissant l'article, donc là qu'il décide de suivre
            l'auteur ou de favoriser. Le composant est le même — deux copies
            divergeraient. */}
        <div className="article-actions">
          <ArticleMeta article={article.data} />
        </div>

        {/* La section n'est montée qu'une fois les commentaires arrivés : elle
            en fait une copie locale à son montage, et un tableau vide au premier
            rendu y resterait vide après la réponse. Le `key` sur le slug ferme
            le cas jumeau — App Router réconcilie la même instance en naviguant
            d'un article à l'autre sur cette route. */}
        {comments.isSuccess && (
          <CommentSection key={slug} slug={slug} initialComments={comments.data} />
        )}
      </div>
    </div>
  )
}
