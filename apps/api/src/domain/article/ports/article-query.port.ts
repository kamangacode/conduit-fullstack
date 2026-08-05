import type { Article, ArticleSummary } from '@repo/shared'
import type { Slug } from '../slug'

/**
 * Identité du lecteur, dont dépendent `favorited` et `author.following`
 * (règle R-5).
 *
 * `null` est l'appelant anonyme, et il est explicite dans la signature plutôt
 * qu'implicite dans un paramètre optionnel : sur un endpoint à authentification
 * facultative, oublier de transmettre le lecteur produit une réponse
 * parfaitement valide où tout vaut `false`. Rendre le paramètre obligatoire
 * force à écrire `null`, donc à décider.
 */
export type ViewerId = string | null

/** Filtres de `GET /api/articles` (R-3), déjà validés par `@repo/shared`. */
export interface ArticleFilters {
  readonly tag?: string
  /** Username de l'auteur — la forme publique, jamais un identifiant interne. */
  readonly author?: string
  /** Username de celui qui a favorisé — à ne pas confondre avec `author`. */
  readonly favoritedBy?: string
  readonly limit: number
  readonly offset: number
}

/** Pagination de `/feed`, qui n'accepte aucun filtre (R-4). */
export interface FeedPagination {
  readonly limit: number
  readonly offset: number
}

/**
 * Une page d'articles et le total **avant** pagination.
 *
 * Les deux champs sont séparés parce qu'ils ne mesurent pas la même chose :
 * `total` alimente `articlesCount` et sert au front à calculer son nombre de
 * pages, tandis que `items.length` n'est que la taille de la tranche. Les deux
 * coïncident tant qu'on teste avec moins d'articles qu'une page — c'est
 * exactement ce qui rend la confusion invisible en développement
 * (REQ-ARTICLE-007 AC-3).
 */
export interface ArticlePage {
  readonly items: readonly ArticleSummary[]
  readonly total: number
}

/**
 * Port de **lecture** des articles (`docs/adr/011-lecture-des-listes-port-dedie.md`).
 *
 * Il renvoie directement les projections du contrat partagé — `Article` à
 * l'unité, `ArticleSummary` en liste, cette dernière sans `body` (R-7) — et non
 * des entités de domaine. Deux conséquences voulues :
 *
 * - le format §8 est produit par le type même du port, donc un écart casse la
 *   compilation au lieu d'être découvert par la suite de conformité ;
 * - les champs relatifs au lecteur sont résolus **en une requête**, là où une
 *   recomposition en use-case interrogerait la base une fois par article.
 *
 * Le lecteur est un paramètre de chaque méthode, jamais un état du port : deux
 * lecteurs obtiennent deux réponses différentes pour la même ressource, et un
 * port qui mémoriserait le lecteur ne pourrait pas être un singleton.
 *
 * Repère pour choisir : **« j'affiche »** prend ce port, **« je modifie »**
 * prend `ArticleRepository`.
 */
export interface ArticleQueryPort {
  /** `null` si aucun article ne porte ce slug — le 404 est décidé par le use-case. */
  findBySlug(slug: Slug, viewer: ViewerId): Promise<Article | null>

  /** Listing global filtré et paginé (REQ-ARTICLE-007). Tri par date décroissante (R-2). */
  list(filters: ArticleFilters, viewer: ViewerId): Promise<ArticlePage>

  /**
   * Flux personnel (REQ-ARTICLE-008). Le lecteur est ici **obligatoire** : sans
   * lui le flux n'a pas de définition, ce que le type dit à la place d'un
   * commentaire (R-4).
   */
  feed(pagination: FeedPagination, viewer: string): Promise<ArticlePage>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const ARTICLE_QUERY = Symbol('ArticleQueryPort')
