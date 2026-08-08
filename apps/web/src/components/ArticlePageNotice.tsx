import Link from 'next/link'

/**
 * Page d'article qui n'a pas pu être affichée (REQ-WEB-018).
 *
 * **C'est toujours la page article**, pas un écran d'erreur : elle porte
 * `.article-page` et le bandeau du template, comme la page qu'elle remplace.
 * Deux raisons, et la seconde ne se voit qu'en la perdant :
 *
 * 1. Le visiteur reste dans l'application — barre de navigation, pied de page,
 *    retour possible — au lieu d'être éjecté sur l'écran générique du
 *    framework, qui n'a ni l'un ni l'autre.
 * 2. Le contrat de sélecteurs e2e identifie la page par cette classe
 *    (REQ-WEB-007). Une page d'erreur qui la perd n'est plus reconnue comme la
 *    page demandée, et l'échec se lit alors comme une route cassée.
 *
 * Les deux causes ne partagent pas leur message : « cet article n'existe pas »
 * affiché pendant une panne est faux, au moment où il coûte le plus cher.
 */

export type PageNoticeKind = 'missing' | 'unavailable'

const ARTICLE_NOTICES: Record<PageNoticeKind, { title: string; message: string }> = {
  missing: {
    title: 'Article not found',
    message: "This article doesn't exist, or it has been deleted by its author.",
  },
  unavailable: {
    title: 'Article unavailable',
    message: 'We could not load this article right now. Please try again in a moment.',
  },
}

export function ArticlePageNotice({ kind }: { readonly kind: PageNoticeKind }) {
  const notice = ARTICLE_NOTICES[kind]

  return (
    <div className="article-page">
      <div className="banner">
        <div className="container">
          <h1>{notice.title}</h1>
        </div>
      </div>

      <div className="container page">
        <div className="row article-content">
          <div className="col-md-12">
            <p>{notice.message}</p>
            <Link href="/">Back to the home page</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
