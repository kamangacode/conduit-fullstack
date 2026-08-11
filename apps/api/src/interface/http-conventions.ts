import type { INestApplication } from '@nestjs/common'

/**
 * Préfixe de toutes les routes du contrat Conduit (PRD §7 : « Base URL :
 * `/api` »).
 *
 * Non exporté : `applyHttpConventions` est le seul point d'entrée, et c'est
 * volontaire — un appelant qui lirait la constante pour reconstruire les chemins
 * de son côté recréerait exactement la divergence que cette fonction existe pour
 * fermer.
 */
const API_PREFIX = 'api'

/**
 * Chemins servis **hors** préfixe.
 *
 * Les sondes sont consommées par la plateforme d'hébergement, pas par un client
 * de l'API : les ranger sous `/api` les ferait dépendre d'une convention qui
 * appartient au contrat métier, et obligerait à les reconfigurer le jour où ce
 * contrat changerait de version (`/api/v2`).
 *
 * **Chaque sous-route est listée explicitement, et ce n'est pas de la verbosité.**
 * L'exclusion de préfixe de NestJS est un **match exact** : `'health'` seul
 * n'exclut pas `health/live` ni `health/ready`, qui repartaient donc sous `/api`
 * — l'inverse exact de ce que ce commentaire promet. Le défaut a été trouvé par
 * AC-5 de REQ-SRE-001 en ajoutant les sondes de l'item C5 ; sans ce critère, les
 * deux nouvelles routes auraient été servies sous le préfixe du contrat, et la
 * configuration de la plateforme aurait pointé sur des 404.
 *
 * Une liste explicite plutôt qu'un motif générique (`health/*`) : la syntaxe des
 * jokers a changé entre les versions de `path-to-regexp` embarquées par NestJS,
 * et une liste fermée de trois chemins ne peut pas se tromper silencieusement.
 */
const UNPREFIXED_PATHS = ['health', 'health/live', 'health/ready']

/**
 * Applique les conventions HTTP communes à une application NestJS.
 *
 * **Pourquoi une fonction plutôt que deux lignes dans `main.ts`** : parce que les
 * tests d'intégration ne passent pas par `main.ts`. Ils construisent leur propre
 * application via `Test.createTestingModule`, et une convention posée uniquement
 * au point d'entrée leur serait invisible.
 *
 * Ce n'est pas une précaution théorique. Le préfixe `/api` a d'abord été absent
 * du dépôt, et la suite d'intégration HTTP est passée au vert en interrogeant
 * `/users` — elle reproduisait l'oubli au lieu de le révéler, parce qu'elle avait
 * été écrite d'après l'implémentation plutôt que d'après le contrat. C'est le
 * patron que la rule 12 décrit : un comportement câblé sur un chemin, absent de
 * son frère. Une seule fonction appelée par les deux ferme le trou.
 *
 * Le CORS relève du même patron. Sans en-tête `Access-Control-Allow-Origin`, le
 * navigateur du front (origine distincte) rejette chaque réponse et n'affiche
 * qu'un « unable to reach the server », alors que l'API a bien répondu — un
 * symptôme qu'aucun test supertest ne révèle, car supertest n'applique pas la
 * politique CORS. Poser l'autorisation ici, dans la fonction partagée, la rend
 * présente au démarrage réel ; l'origine par défaut (`http://localhost:3000`)
 * sert les tests, une origine explicite sert la production (voir `env.CORS_ORIGIN`).
 */

/** Origine de dev par défaut quand aucune n'est fournie (tests, oubli de config). */
/** Exportée pour que les tests asserttent la valeur réelle du repli, pas une copie. */
export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000'

/** Options des conventions HTTP. */
export interface HttpConventionsOptions {
  /** Origine(s) autorisée(s) pour les requêtes cross-origin (CORS). */
  readonly corsOrigin?: string | string[]
}

export function applyHttpConventions(
  app: INestApplication,
  options: HttpConventionsOptions = {}
): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_PATHS })
  app.enableCors({
    origin: options.corsOrigin ?? DEFAULT_CORS_ORIGIN,
  })
}
