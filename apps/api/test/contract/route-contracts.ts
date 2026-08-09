import {
  articleResponseSchema,
  articlesResponseSchema,
  commentResponseSchema,
  commentsResponseSchema,
  profileResponseSchema,
  tagsResponseSchema,
  userResponseSchema,
} from '@repo/shared'
import type { ZodType } from 'zod'

/**
 * Registre du contrat de sortie : à quelle enveloppe de `packages/shared`
 * chaque route de l'application est tenue (REQ-ARCH-002, ADR 026).
 *
 * Ce fichier est la seule chose qu'un endpoint futur doit toucher pour être
 * couvert. C'est aussi ce qui rend l'oubli impossible plutôt qu'improbable :
 * `contract-registry-check.ts` compare ce registre aux routes **réellement
 * montées** au démarrage de la lane d'intégration, et échoue dans les deux sens
 * — route montée non déclarée, déclaration devenue orpheline.
 *
 * Il vit sous `test/` et non sous `src/` : rien de tout ceci ne part en
 * production (voir l'entête de `contract-harness.ts`, qui dit pourquoi).
 */

/**
 * La route ne rend aucun corps (204). Le marqueur est **vérifié**, pas une
 * dispense : un corps qui apparaîtrait sur une telle route est un écart au
 * contrat, au même titre qu'un champ en trop ailleurs.
 */
export const NO_BODY = Symbol('contrat: pas de corps')

/**
 * La route ne relève pas du contrat Conduit — aujourd'hui la seule sonde
 * `/health`, qui vit hors du préfixe `/api` et ne décrit aucune ressource du
 * modèle.
 *
 * Ce marqueur existe pour que l'exemption soit une **décision écrite** : sans
 * lui, la seule façon d'exempter une route serait de l'omettre du registre, et
 * une omission volontaire est indiscernable d'un oubli.
 */
export const OUT_OF_CONTRACT = Symbol('contrat: hors contrat Conduit')

export type ContractEntry = ZodType | typeof NO_BODY | typeof OUT_OF_CONTRACT

/**
 * Clé d'une route : méthode HTTP + **motif** de chemin, jamais l'URL concrète.
 *
 * Le motif (`/api/articles/:slug`) est ce que rendent à la fois l'énumération du
 * routeur Express et `req.route.path` vu par l'intercepteur — c'est ce qui
 * permet aux deux moitiés du harnais de parler de la même chose.
 */
export const routeKey = (method: string, path: string): string => `${method.toUpperCase()} ${path}`

/**
 * Les 20 routes montées par `AppModule`, chacune face à l'enveloppe que le
 * contrat lui impose (PRD §7).
 */
export const ROUTE_CONTRACTS: Readonly<Record<string, ContractEntry>> = {
  'GET /health': OUT_OF_CONTRACT,

  // §7.1 — comptes et authentification
  'POST /api/users': userResponseSchema,
  'POST /api/users/login': userResponseSchema,
  'GET /api/user': userResponseSchema,
  'PUT /api/user': userResponseSchema,

  // §7.2 — profils et suivi
  'GET /api/profiles/:username': profileResponseSchema,
  'POST /api/profiles/:username/follow': profileResponseSchema,
  'DELETE /api/profiles/:username/follow': profileResponseSchema,

  // §7.3 — articles
  'GET /api/articles': articlesResponseSchema,
  'GET /api/articles/feed': articlesResponseSchema,
  'GET /api/articles/:slug': articleResponseSchema,
  'POST /api/articles': articleResponseSchema,
  'PUT /api/articles/:slug': articleResponseSchema,
  'DELETE /api/articles/:slug': NO_BODY,

  // §7.4 — favoris. Les deux rendent l'article, jamais un compteur seul :
  // le front réaffiche la carte entière après l'action.
  'POST /api/articles/:slug/favorite': articleResponseSchema,
  'DELETE /api/articles/:slug/favorite': articleResponseSchema,

  // §7.5 — commentaires
  'POST /api/articles/:slug/comments': commentResponseSchema,
  'GET /api/articles/:slug/comments': commentsResponseSchema,
  'DELETE /api/articles/:slug/comments/:id': NO_BODY,

  // §7.6 — étiquettes
  'GET /api/tags': tagsResponseSchema,
}
