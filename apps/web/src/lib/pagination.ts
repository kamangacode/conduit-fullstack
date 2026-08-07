/**
 * Arithmétique de pagination (REQ-WEB-010).
 *
 * Séparée du rendu parce que c'est **ici que vivent les erreurs invisibles**.
 * Une pagination fausse ne lève rien : elle affiche simplement moins de pages
 * qu'il n'en existe, et les articles au-delà deviennent inatteignables sans
 * qu'aucun symptôme ne désigne la cause. Un module pur s'éprouve sur des totaux
 * qu'on ne rencontre pas en développement local — 41, 47 — là où un test de
 * composant se contente naturellement de jeux ronds.
 */

/** Nom du paramètre de page dans l'URL, fixé par le contrat de sélecteurs E2E. */
const PAGE_PARAM = 'page'

/**
 * Taille de page du front ([ADR 023]).
 *
 * Dix, et non les vingt de `DEFAULT_PAGE_LIMIT` : c'est ce que le contrat de
 * conformité attend — quinze articles y font deux pages, dix puis cinq.
 *
 * La règle d'origine de REQ-WEB-010 — « la taille de page vient de
 * `@repo/shared` » — protégeait d'un désalignement entre le découpage du front
 * et celui de l'API. Cette protection **survit au changement de valeur**, parce
 * que ce qui la garantit n'est pas de partager la constante : c'est que le front
 * **envoie** sa taille (`limit`) à chaque requête au lieu de laisser l'API
 * choisir la sienne. `DEFAULT_PAGE_LIMIT` reste ce que l'API applique quand
 * personne ne demande rien ; cette valeur-ci est ce que ce front demande.
 *
 * Le couple à ne pas casser est donc `WEB_PAGE_LIMIT` ↔ `fetchFeed` : calculer
 * les pages sur une taille et découper sur une autre ne lève rien du tout, et
 * fait simplement disparaître des articles.
 */
export const WEB_PAGE_LIMIT = 10

/**
 * Nombre de pages nécessaires pour `articlesCount` articles.
 *
 * `Math.ceil` et non une division entière : 41 articles sur des pages de 20 en
 * font **trois**, et perdre la dernière rend son contenu inatteignable. Un
 * total nul ne fait aucune page — pas une page vide.
 */
export function pageCount(articlesCount: number, limit: number = WEB_PAGE_LIMIT): number {
  return Math.ceil(articlesCount / limit)
}

/** Décalage à envoyer à l'API pour une page donnée. La première vaut zéro. */
export function offsetForPage(page: number, limit: number = WEB_PAGE_LIMIT): number {
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

/** Cible d'un contrôle de pagination, sous la forme qu'un formulaire GET soumet. */
export interface PageFormTarget {
  /**
   * `action` du formulaire : le chemin courant, **sans requête**.
   *
   * Un formulaire GET remplace la query string de son `action` par ses propres
   * champs. Y laisser des paramètres serait donc silencieusement inutile — d'où
   * le chemin seul, et les filtres portés par `fields`.
   */
  readonly action: string
  /**
   * Filtres courants à reporter en champs cachés, `page` exclu — dans l'ordre
   * où ils doivent apparaître dans le DOM, donc dans l'URL soumise.
   */
  readonly fields: readonly (readonly [name: string, value: string])[]
  /**
   * Valeur à soumettre pour `page`, ou `null` sur la première.
   *
   * `null` n'est pas « zéro » : c'est l'instruction de ne pas nommer le bouton
   * du tout. Un contrôle sans `name` n'est pas soumis, donc la cible ne porte
   * jamais `page=1` — les deux désigneraient la même ressource, et en produire
   * deux ferait deux entrées d'historique et deux URL à indexer.
   *
   * Quand ce contrôle est aussi le seul champ du formulaire (aucun filtre
   * courant), la cible n'est pas garantie identique au caractère près à
   * `pathname` : un formulaire GET sans aucun champ nommé soumet malgré tout
   * une requête, et certains navigateurs y ajoutent un `?` vide (le jeu de
   * données codé étant la chaîne vide, non l'absence de requête — le
   * comportement suit l'algorithme de soumission de formulaire du standard
   * HTML, pas l'API `URL.search`, qui elle purge le `?` sur une valeur vide).
   * `/?` et `/` désignent la même ressource pour tout ce qui lit cette URL
   * ensuite (Next.js, `searchParams`) ; l'invariant réellement garanti est
   * « aucun `page` soumis », pas « chaîne d'URL identique ».
   */
  readonly page: string | null
}

/**
 * Cible d'un changement de page, **filtres conservés** ([ADR 023]).
 *
 * Reconstruire la cible à partir du seul numéro de page est l'erreur classique :
 * le tag ou le flux en cours disparaît, et le symptôme — « je clique sur la
 * page 2 d'un tag et j'atterris sur le flux global » — se lit comme un bug de
 * filtre alors qu'il vient du contrôle.
 *
 * Les filtres sortent **avant** la page parce qu'un navigateur soumet les
 * champs dans l'ordre du DOM : c'est ce qui produit `/?feed=following&page=2`,
 * la forme exacte que le contrat de conformité attend.
 */
export function pageFormTarget(
  pathname: string,
  searchParams: URLSearchParams,
  page: number
): PageFormTarget {
  const fields = [...searchParams.entries()].filter(([name]) => name !== PAGE_PARAM)

  return {
    action: pathname,
    fields,
    page: page > 1 ? String(page) : null,
  }
}
