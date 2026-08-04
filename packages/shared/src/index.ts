/**
 * @repo/shared — source de vérité unique du modèle Conduit.
 *
 * Ce package ne dépend d'aucun framework (ni NestJS, ni React) : c'est du
 * TypeScript pur importable par `apps/api` comme par `apps/web`. La cohérence
 * front/back n'est pas un contrat externe à maintenir en double, mais une
 * dépendance de compilation : si le modèle change ici, ce qui ne suit pas ne
 * compile plus des deux côtés.
 *
 * Phase 0 (bootstrap) : le package n'expose qu'un marqueur de version. Le
 * modèle Conduit réel (types Article/Comment/Profile/User, DTOs, enums, schémas
 * Zod) arrive en issue 2 — voir architecture/architecture.md §3.
 */

/** Version du contrat de modèle partagé. Incrémentée quand le modèle Conduit évolue. */
export const SHARED_MODEL_VERSION = "0.0.0" as const;
