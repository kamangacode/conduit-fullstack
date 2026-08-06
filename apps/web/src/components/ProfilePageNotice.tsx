import Link from 'next/link'
import type { PageNoticeKind } from './ArticlePageNotice'

/**
 * Page de profil qui n'a pas pu être affichée (REQ-WEB-018).
 *
 * Même parti que `ArticlePageNotice`, et pour les mêmes raisons : la coquille
 * reste celle du template — `.profile-page` **et** `.user-info`, que le contrat
 * de sélecteurs vise l'une comme l'autre.
 *
 * Les deux blocs sont conservés bien qu'il n'y ait ni avatar ni bio à montrer :
 * ce sont eux qui donnent à l'écran la forme d'une page de profil. Ne garder que
 * le conteneur extérieur produirait un message flottant en haut d'une page vide.
 */

const PROFILE_NOTICES: Record<PageNoticeKind, { title: string; message: string }> = {
  missing: {
    title: 'Profile not found',
    message: 'No one is registered under this name.',
  },
  unavailable: {
    title: 'Profile unavailable',
    message: 'We could not load this profile right now. Please try again in a moment.',
  },
}

export function ProfilePageNotice({ kind }: { readonly kind: PageNoticeKind }) {
  const notice = PROFILE_NOTICES[kind]

  return (
    <div className="profile-page">
      <div className="user-info">
        <div className="container">
          <div className="row">
            <div className="col-xs-12 col-md-10 offset-md-1">
              <h4>{notice.title}</h4>
              <p>{notice.message}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="row">
          <div className="col-xs-12 col-md-10 offset-md-1">
            <Link href="/">Back to the home page</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
