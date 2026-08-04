import { z } from 'zod'
import { paginationQuerySchema } from './pagination'
import { profileSchema } from './profile'
import { tagSchema } from './tag'

/**
 * Article complet, tel que renvoyé par les endpoints **unitaires**
 * (PRD §6, format §8 « Single Article »).
 *
 * `favorited` est relatif à l'utilisateur courant (règle R-5), `favoritesCount`
 * est absolu. Les dates sont des chaînes ISO 8601 et non des `Date` : c'est la
 * forme réellement transportée par JSON, et la seule sur laquelle l'API et le
 * front peuvent s'accorder sans sérialiseur intermédiaire.
 */
export const articleSchema = z.object({
  /** Identifiant public dérivé du titre (règle R-1). */
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  /** Markdown. Absent des réponses de liste (règle R-7) — cf. `articleSummarySchema`. */
  body: z.string(),
  tagList: z.array(tagSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Relatif à l'utilisateur courant (R-5). */
  favorited: z.boolean(),
  favoritesCount: z.number().int().nonnegative(),
  author: profileSchema,
})

export type Article = z.infer<typeof articleSchema>

/**
 * Article tel que renvoyé par les endpoints de **liste** (`GET /api/articles`
 * et `/api/articles/feed`). Depuis le 2024-08-16 la spec en retire le `body`
 * pour des raisons de performance (règle R-7).
 *
 * Dérivé par `.omit()` plutôt que réécrit : un champ ajouté à l'article se
 * propage mécaniquement à la liste, et l'écart entre les deux formes reste
 * exactement la règle R-7, lisible en une ligne au lieu d'être une divergence
 * à repérer en comparant deux schémas.
 */
export const articleSummarySchema = articleSchema.omit({ body: true })

export type ArticleSummary = z.infer<typeof articleSummarySchema>

/** Enveloppe `{ "article": … }` (PRD §8). */
export const articleResponseSchema = z.object({ article: articleSchema })

export type ArticleResponse = z.infer<typeof articleResponseSchema>

/** Enveloppe `{ "articles": [...], "articlesCount": n }` (PRD §8). */
export const articlesResponseSchema = z.object({
  articles: z.array(articleSummarySchema),
  /**
   * Total **avant** pagination : c'est ce qui permet au front de calculer le
   * nombre de pages. Il n'est donc pas égal à `articles.length` dès qu'un
   * `limit` tronque le résultat.
   */
  articlesCount: z.number().int().nonnegative(),
})

export type ArticlesResponse = z.infer<typeof articlesResponseSchema>

/* ------------------------------------------------------------------ *
 * DTOs d'entrée                                                       *
 * ------------------------------------------------------------------ */

/**
 * Création — `POST /api/articles` (PRD §7.3).
 *
 * `tagList` est le seul champ facultatif (spec : « Optional fields: tagList »).
 * `.default([])` plutôt que `.optional()` : après parse, le tableau existe
 * toujours, donc aucun use case en aval n'a de cas « absent » à gérer. La forme
 * réellement acceptée sur le fil, elle, autorise bien l'omission — elle
 * s'obtient par `z.input<typeof createArticleDtoSchema>`.
 */
export const createArticleDtoSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  body: z.string().trim().min(1),
  tagList: z.array(tagSchema).default([]),
})

export type CreateArticleDto = z.infer<typeof createArticleDtoSchema>

export const createArticleRequestSchema = z.object({ article: createArticleDtoSchema })

export type CreateArticleRequest = z.infer<typeof createArticleRequestSchema>

/**
 * Édition — `PUT /api/articles/:slug` (PRD §7.3). Tous les champs sont
 * optionnels ; changer le `title` régénère le `slug` (règle R-1), ce qui est le
 * travail de l'API, pas de ce schéma.
 */
export const updateArticleDtoSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  tagList: z.array(tagSchema).optional(),
})

export type UpdateArticleDto = z.infer<typeof updateArticleDtoSchema>

export const updateArticleRequestSchema = z.object({ article: updateArticleDtoSchema })

export type UpdateArticleRequest = z.infer<typeof updateArticleRequestSchema>

/**
 * Filtres de `GET /api/articles` (PRD §7.3, règles R-3 et R-10), pagination
 * comprise. `author` et `favorited` désignent des **usernames**, pas des
 * identifiants internes — c'est la forme publique du contrat.
 */
export const listArticlesQuerySchema = paginationQuerySchema.extend({
  tag: tagSchema.optional(),
  author: z.string().trim().min(1).optional(),
  favorited: z.string().trim().min(1).optional(),
})

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>
