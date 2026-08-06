import Link from 'next/link'
import type { PageNoticeKind } from './ArticlePageNotice'

/**
 * Page de profil qui n'a pas pu être affichée (REQ-WEB-018).
 *
 * Même parti que `ArticlePageNotice`, et pour la même raison : la coquille reste
 * celle du template plutôt que l'écran générique du framework.
 *
 * **Elle porte `.profile-page` et rien d'autre**, et c'est une contrainte du
 * contrat, pas une économie de markup. La suite e2e localise cette page par
 * `.profile-page, .user-info` — un sélecteur à deux branches, évalué en **mode
 * strict** : il échoue dès que *les deux* existent. La page de profil réelle
 * imbrique pourtant l'une dans l'autre, comme le gabarit RealWorld le prescrit ;
 * une coquille qui recopierait cette imbrication ferait donc échouer les trois
 * tests qui l'attendent, avec un message (« resolved to 2 elements ») qui ne
 * ressemble en rien à la cause.
 *
 * Première version écrite avec les deux blocs, précisément pour « garder la
 * forme d'une page de profil ». Les trois tests l'ont contredite.
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
      <div className="container">
        <div className="row">
          <div className="col-xs-12 col-md-10 offset-md-1">
            <h4>{notice.title}</h4>
            <p>{notice.message}</p>
            <Link href="/">Back to the home page</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
