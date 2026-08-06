import Link from 'next/link'
import { pageCount, pageHref } from '../lib/pagination'

/**
 * Pagination d'une liste d'articles (REQ-WEB-010), markup RealWorld (rule 11).
 *
 * Composant **serveur** : il ne rend que des liens, dont l'état dépend
 * uniquement de l'URL et du total renvoyé par l'API — rien qui appartienne au
 * lecteur (ADR 012). Le faire client coûterait du JavaScript pour reproduire ce
 * qu'une balise `<a>` fait déjà.
 *
 * Toute l'arithmétique vit dans `lib/pagination.ts`, éprouvée sur des totaux
 * qu'on ne rencontre pas en développement local : c'est là que se cachent les
 * fautes qui ne lèvent rien et rendent des articles inatteignables.
 */

export interface PaginationProps {
  /** Total **avant** pagination, tel que l'API l'annonce — jamais `articles.length`. */
  readonly articlesCount: number
  readonly currentPage: number
  /** Chemin courant, conservé par les liens (`/`, `/tag/dragons`…). */
  readonly pathname: string
  /** Filtres courants, reportés sur chaque lien. */
  readonly searchParams: URLSearchParams
}

export function Pagination({
  articlesCount,
  currentPage,
  pathname,
  searchParams,
}: PaginationProps) {
  const pages = pageCount(articlesCount)

  // Une seule page — ou aucune — n'a rien à paginer. Rendre une liste à un seul
  // élément afficherait un contrôle inerte que le lecteur essaierait de cliquer.
  if (pages <= 1) {
    return null
  }

  return (
    <ul className="pagination">
      {Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
        <li className={`page-item${page === currentPage ? ' active' : ''}`} key={page}>
          {/* `aria-current` : la classe `active` marque la page courante pour
              l'œil et pour le contrat de sélecteurs, mais elle ne dit rien à un
              lecteur d'écran. L'écart au gabarit est de ceux que la rule 11
              autorise — il n'ajoute ni classe ni nœud, donc la suite E2E n'y
              voit rien. */}
          <Link
            aria-current={page === currentPage ? 'page' : undefined}
            className="page-link"
            href={pageHref(pathname, searchParams, page)}
          >
            {page}
          </Link>
        </li>
      ))}
    </ul>
  )
}
