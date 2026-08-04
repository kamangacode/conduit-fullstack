/**
 * @repo/shared — source de vérité unique du modèle Conduit.
 *
 * Ce package ne dépend d'aucun framework (ni NestJS, ni React) : c'est du
 * TypeScript pur importable par `apps/api` comme par `apps/web`. La cohérence
 * front/back n'est pas un contrat externe à maintenir en double, mais une
 * dépendance de compilation : si le modèle change ici, ce qui ne suit pas ne
 * compile plus des deux côtés.
 *
 * Parti pris d'écriture : le **schéma Zod est l'unique définition**, le type
 * TypeScript en est inféré (`z.infer`). Une règle de validation n'existe donc
 * qu'à un seul endroit, et un type ne peut pas dériver de la validation qui est
 * censée le garantir. Voir `docs/adr/001-topologie-monorepo-modele-partage.md`.
 *
 * Le contrat externe suit la spec RealWorld : PRD §7 (API), §8 (formats
 * verbatim), §10 (erreurs), §11 (règles métier R-1 à R-10).
 */

/** Version du contrat de modèle partagé. Incrémentée quand le modèle Conduit évolue. */
export const SHARED_MODEL_VERSION = '1.0.0' as const

export * from './errors/error-codes'
export * from './errors/validation-errors'
export * from './model/article'
export * from './model/comment'
export * from './model/pagination'
export * from './model/profile'
export * from './model/tag'
export * from './model/user'
