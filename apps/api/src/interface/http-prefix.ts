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
 * La sonde de santé est consommée par la plateforme d'hébergement, pas par un
 * client de l'API : la ranger sous `/api` la ferait dépendre d'une convention
 * qui appartient au contrat métier, et obligerait à reconfigurer la sonde le jour
 * où ce contrat changerait de version (`/api/v2`).
 */
const UNPREFIXED_PATHS = ['health']

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
 */
export function applyHttpConventions(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_PATHS })
}
