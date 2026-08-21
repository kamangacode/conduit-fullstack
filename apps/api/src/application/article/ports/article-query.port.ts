import type { Slug } from '../../../domain/article/slug'
import type { ViewerId } from '../../shared/viewer-id'
import type { ArticleListPage, ArticleView } from './article-view'

/**
 * Filtres de listing d'articles (R-3), déjà normalisés à la frontière HTTP.
 *
 * Le port ne connaît pas la route qui les produit. Il décrit ce sur quoi une
 * lecture d'articles peut être restreinte, et rien de plus.
 */
export interface ArticleFilters {
  readonly tag?: string
  /** Username de l'auteur. */
  readonly author?: string
  /** Username de celui qui a favorisé, à ne pas confondre avec `author`. */
  readonly favoritedBy?: string
  readonly limit: number
  readonly offset: number
}

/** Pagination d'un flux, qui n'accepte aucun filtre (R-4). */
export interface FeedPagination {
  readonly limit: number
  readonly offset: number
}

/**
 * Port de **lecture** des articles.
 *
 * Il vit dans `application/` et non dans `domain/`, et c'est le coeur de
 * l'[ADR 031](../../../../../docs/adr/031-le-contrat-partage-s-arrete-a-la-frontiere-http.md) :
 * un port vit là où vit ce qu'il protège. Celui-ci ne protège aucun invariant.
 * Il sert un cas d'usage d'affichage, dont le résultat dépend du lecteur et non
 * du métier. Le placer dans `domain/` était une conséquence de la convention
 * « les ports vivent dans domain/ », et c'est cette convention qui était fausse.
 *
 * Il renvoie des read models possédés par le dépôt (`article-view.ts`), pas les
 * projections du contrat partagé. La séparation lecture / écriture décidée par
 * l'ADR 011 est en revanche conservée telle quelle, avec son motif principal :
 * les champs relatifs au lecteur sont résolus **en une requête**, là où une
 * recomposition en use-case interrogerait la base une fois par article.
 *
 * Le lecteur est un paramètre de chaque méthode, jamais un état du port : deux
 * lecteurs obtiennent deux réponses différentes pour la même ressource, et un
 * port qui mémoriserait le lecteur ne pourrait pas être un singleton.
 *
 * Repère pour choisir : **« j'affiche »** prend ce port, **« je modifie »**
 * prend `ArticleRepository`, qui reste dans `domain/` parce qu'il manipule un
 * agrégat porteur d'invariants.
 */
export interface ArticleQueryPort {
  /** `null` si aucun article ne porte ce slug — le 404 est décidé par le use-case. */
  findBySlug(slug: Slug, viewer: ViewerId): Promise<ArticleView | null>

  /** Listing global filtré et paginé (REQ-ARTICLE-007). Tri par date décroissante (R-2). */
  list(filters: ArticleFilters, viewer: ViewerId): Promise<ArticleListPage>

  /**
   * Flux personnel (REQ-ARTICLE-008). Le lecteur est ici **obligatoire** : sans
   * lui le flux n'a pas de définition, ce que le type dit à la place d'un
   * commentaire (R-4).
   */
  feed(pagination: FeedPagination, viewer: string): Promise<ArticleListPage>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const ARTICLE_QUERY = Symbol('ArticleQueryPort')
