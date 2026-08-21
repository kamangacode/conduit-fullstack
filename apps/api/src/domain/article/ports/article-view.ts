import type { AuthorView } from '../../shared/author-view'

/**
 * Read models de la lecture d'articles.
 *
 * Ces types sont **possédés par le dépôt**, pas importés du contrat (ADR 031).
 * Ils décrivent ce qu'une requête de lecture sait produire, dans le vocabulaire
 * de l'application et non dans celui du fil : `createdAt` est une `Date`, pas
 * une chaîne ISO 8601. La sérialisation est le travail du mapper de
 * `interface/`.
 *
 * `AuthorView` vit dans `domain/shared/` et non ici : il est partagé par la
 * lecture d'articles et celle de commentaires, exactement comme `ViewerId`. Le
 * déclarer dans ce fichier recréerait l'arête `comment -> article`.
 *
 * Avant l'ADR 031, le port renvoyait directement `Article` et `ArticleSummary`
 * de `@repo/shared`. Le raccourci avait un mérite — le format §8 était produit
 * par le type même du port — et un coût qui a fini par dominer : le domaine
 * dépendait du contrat HTTP. Renommer un champ de réponse faisait bouger le
 * coeur métier, sans qu'aucune règle métier n'ait changé.
 */

/**
 * Article complet destiné à l'affichage, `body` inclus.
 *
 * `favorited` est relatif au lecteur (R-5), `favoritesCount` est absolu.
 */
export interface ArticleView {
  readonly slug: string
  readonly title: string
  readonly description: string
  readonly body: string
  readonly tagList: readonly string[]
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly favorited: boolean
  readonly favoritesCount: number
  readonly author: AuthorView
}

/**
 * Article en liste : le même **sans le `body`** (R-7).
 *
 * Dérivé par `Omit` plutôt que réécrit, pour que l'écart entre les deux formes
 * reste exactement la règle R-7, lisible en une ligne au lieu d'être une
 * divergence à repérer en comparant deux déclarations. C'est le pendant du
 * `.omit()` que le contrat partagé applique de son côté.
 */
export type ArticleSummaryView = Omit<ArticleView, 'body'>

/**
 * Une page d'articles et le total **avant** pagination.
 *
 * Les deux champs sont séparés parce qu'ils ne mesurent pas la même chose :
 * `total` sert au front à calculer son nombre de pages, tandis que
 * `items.length` n'est que la taille de la tranche. Les deux coïncident tant
 * qu'on teste avec moins d'articles qu'une page, ce qui rend la confusion
 * invisible en développement (REQ-ARTICLE-007 AC-3).
 *
 * Le nom du champ est `total`, pas `articlesCount` : ce dernier est un nom de la
 * spec RealWorld, donc du transport. Le mapper fait la correspondance.
 */
export interface ArticleListPage {
  readonly items: readonly ArticleSummaryView[]
  readonly total: number
}
