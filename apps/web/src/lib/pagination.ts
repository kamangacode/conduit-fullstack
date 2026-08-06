import { DEFAULT_PAGE_LIMIT } from '@repo/shared'

/**
 * Arithmétique de pagination (REQ-WEB-010).
 *
 * Séparée du rendu parce que c'est **ici que vivent les erreurs invisibles**.
 * Une pagination fausse ne lève rien : elle affiche simplement moins de pages
 * qu'il n'en existe, et les articles au-delà deviennent inatteignables sans
 * qu'aucun symptôme ne désigne la cause. Un module pur s'éprouve sur des totaux
 * qu'on ne rencontre pas en développement local — 41, 47 — là où un test de
 * composant se contente naturellement de jeux ronds.
 *
 * La taille de page vient de `@repo/shared` : l'API applique la même valeur
 * (règle R-10), et deux constantes qui divergent produisent des pages qui se
 * chevauchent ou qui sautent des articles.
 */

/** Nom du paramètre de page dans l'URL, fixé par le contrat de sélecteurs E2E. */
const PAGE_PARAM = 'page'

/**
 * Nombre de pages nécessaires pour `articlesCount` articles.
 *
 * `Math.ceil` et non une division entière : 41 articles sur des pages de 20 en
 * font **trois**, et perdre la dernière rend son contenu inatteignable. Un
 * total nul ne fait aucune page — pas une page vide.
 */
export function pageCount(articlesCount: number, limit: number = DEFAULT_PAGE_LIMIT): number {
  return Math.ceil(articlesCount / limit)
}

/** Décalage à envoyer à l'API pour une page donnée. La première vaut zéro. */
export function offsetForPage(page: number, limit: number = DEFAULT_PAGE_LIMIT): number {
  return (page - 1) * limit
}

/**
 * Numéro de page lu depuis l'URL.
 *
 * Tout ce qui n'est pas un entier positif retombe sur la première page. Ce
 * n'est pas de la défiance envers l'utilisateur : une URL se forge à la main,
 * se copie tronquée, et un `page=-4` non filtré produirait un décalage négatif
 * que l'API rejetterait par un 422 — une erreur technique là où le lecteur
 * attend simplement une liste.
 */
export function pageFromParam(raw: string | undefined): number {
  if (!raw) {
    return 1
  }

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * Lien vers une page, **filtres conservés**.
 *
 * Reconstruire le lien à partir du seul numéro de page est l'erreur classique :
 * le tag ou le flux en cours disparaît, et le symptôme — « je clique sur la
 * page 2 d'un tag et j'atterris sur le flux global » — se lit comme un bug de
 * filtre alors qu'il vient du lien.
 *
 * La première page **omet** le paramètre : `/?page=1` et `/` désignent la même
 * ressource, et en produire deux ferait deux entrées d'historique et deux URL à
 * indexer pour une seule page.
 */
export function pageHref(pathname: string, searchParams: URLSearchParams, page: number): string {
  const params = new URLSearchParams(searchParams)

  if (page <= 1) {
    params.delete(PAGE_PARAM)
  } else {
    params.set(PAGE_PARAM, String(page))
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
