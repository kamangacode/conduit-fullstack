import { pageCount, pageFormTarget } from '../lib/pagination'

/**
 * Pagination d'une liste d'articles (REQ-WEB-010), markup RealWorld (rule 11).
 *
 * **Écart au gabarit, documenté ici comme la rule 11 l'exige** : le template de
 * référence rend `li.page-item > a.page-link`, ce composant rend
 * `li.page-item > form > button.page-link`. Le contrat de conformité vise
 * `.pagination button` et `.page-item:has(button…)`, et `SELECTORS.md` décrit
 * `.page-item` comme un *« page button wrapper »* — un `<a>` ne satisfait ni
 * l'un ni l'autre, et imbriquer un `<button>` dans le `<a>` serait du HTML
 * invalide (contenu interactif imbriqué).
 *
 * Le formulaire GET plutôt qu'un `onClick={router.push}` ([ADR 023]) : la
 * navigation reste une vraie navigation d'URL, elle fonctionne sans JavaScript,
 * et le composant n'a aucun état — il reste donc rendable côté serveur là où on
 * l'appellerait ainsi.
 *
 * Toute l'arithmétique vit dans `lib/pagination.ts`, éprouvée sur des totaux
 * qu'on ne rencontre pas en développement local : c'est là que se cachent les
 * fautes qui ne lèvent rien et rendent des articles inatteignables.
 */

export interface PaginationProps {
  /** Total **avant** pagination, tel que l'API l'annonce — jamais `articles.length`. */
  readonly articlesCount: number
  readonly currentPage: number
  /** Chemin courant, conservé par les contrôles (`/`, `/tag/dragons`…). */
  readonly pathname: string
  /** Filtres courants, reportés sur chaque contrôle. */
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
          <PageControl
            active={page === currentPage}
            page={page}
            pathname={pathname}
            searchParams={searchParams}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * Un contrôle = un formulaire GET.
 *
 * Extrait pour garder `Pagination` lisible : la cellule porte trois
 * préoccupations (la cible, les filtres reportés, l'état courant) que le corps
 * de la boucle mélangeait.
 */
function PageControl({
  active,
  page,
  pathname,
  searchParams,
}: {
  readonly active: boolean
  readonly page: number
  readonly pathname: string
  readonly searchParams: URLSearchParams
}) {
  const target = pageFormTarget(pathname, searchParams, page)

  return (
    <form action={target.action} method="get">
      {/* Les filtres courants, **avant** le bouton : un navigateur soumet dans
          l'ordre du DOM, et c'est cet ordre qui produit
          `/?feed=following&page=2` plutôt que l'inverse. */}
      {target.fields.map(([name, value], index) => (
        <input key={`${name}-${index}`} name={name} type="hidden" value={value} />
      ))}
      {/* `aria-current` : la classe `active` marque la page courante pour l'œil
          et pour le contrat de sélecteurs, mais elle ne dit rien à un lecteur
          d'écran.

          Pas de `name` sur la première page : un contrôle sans nom n'est pas
          soumis, donc la cible reste `/` et non `/?page=1`. */}
      {target.page === null ? (
        <button aria-current={active ? 'page' : undefined} className="page-link" type="submit">
          {page}
        </button>
      ) : (
        <button
          aria-current={active ? 'page' : undefined}
          className="page-link"
          name="page"
          type="submit"
          value={target.page}
        >
          {page}
        </button>
      )}
    </form>
  )
}
