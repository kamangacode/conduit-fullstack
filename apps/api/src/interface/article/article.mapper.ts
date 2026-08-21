import type { Article, ArticleSummary, ArticlesResponse, Profile } from '@repo/shared'
import type {
  ArticleListPage,
  ArticleSummaryView,
  ArticleView,
} from '../../domain/article/ports/article-view'
import type { AuthorView } from '../../domain/shared/author-view'

/**
 * Traduction des read models d'article vers le contrat HTTP.
 *
 * C'est ici, et nulle part ailleurs, que la forme du fil est produite : dates
 * sérialisées en ISO 8601, tableaux figés, enveloppe `{ articles, articlesCount }`.
 * Le read model parle en `Date` et en `total` (ADR 031).
 *
 * Ce fichier reprend une garantie que l'ancien port de lecture portait
 * gratuitement : quand il renvoyait directement `Article`, un écart de forme
 * cassait la compilation. La garantie ne disparaît pas, elle se paie ici — les
 * signatures sont annotées, donc un champ oublié ou de mauvais type ne compile
 * pas davantage. Ce qui change est qu'elle est désormais **locale au transport**
 * au lieu de traverser toutes les couches.
 *
 * Elle reste par ailleurs doublée par le harnais de contrat de l'ADR 026, qui
 * asserte la forme sur toutes les routes et n'a pas bougé.
 */

/** Auteur : même forme que `Profile`, mais ce n'en est pas un tant qu'on ne l'a pas dit. */
export const toProfile = (author: AuthorView): Profile => ({
  username: author.username,
  bio: author.bio,
  image: author.image,
  following: author.following,
})

/**
 * Article en liste (PRD §8 « Multiple Articles »), sans `body` (R-7).
 *
 * `tagList` est recopié plutôt que passé tel quel : le read model l'expose en
 * `readonly string[]`, et le contrat attend un tableau mutable. La copie est ce
 * qui empêche un appelant de muter la projection que la couche du dessous vient
 * de produire.
 */
export const toArticleSummary = (view: ArticleSummaryView): ArticleSummary => ({
  slug: view.slug,
  title: view.title,
  description: view.description,
  tagList: [...view.tagList],
  createdAt: view.createdAt.toISOString(),
  updatedAt: view.updatedAt.toISOString(),
  favorited: view.favorited,
  favoritesCount: view.favoritesCount,
  author: toProfile(view.author),
})

/** Article unitaire (PRD §8 « Single Article »), `body` inclus. */
export const toArticle = (view: ArticleView): Article => ({
  ...toArticleSummary(view),
  body: view.body,
})

/**
 * Enveloppe de liste (PRD §8).
 *
 * `articlesCount` vaut `page.total`, **pas** `articles.length` : c'est le total
 * avant pagination, dont le front déduit son nombre de pages (REQ-ARTICLE-007
 * AC-3). Les deux coïncident tant qu'on teste avec moins d'articles qu'une page,
 * ce qui rend la confusion invisible en développement — c'est la raison pour
 * laquelle la distinction est portée jusqu'ici par deux noms différents plutôt
 * que par un commentaire.
 */
export const toArticlesResponse = (page: ArticleListPage): ArticlesResponse => ({
  articles: page.items.map(toArticleSummary),
  articlesCount: page.total,
})
