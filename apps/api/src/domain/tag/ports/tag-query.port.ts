import type { Tag } from '@repo/shared'

/**
 * Port de lecture des tags (REQ-TAG-002).
 *
 * Une seule méthode, et son nom porte la règle : `listUsed`, pas `listAll`. Le
 * schéma persiste les tags dans une table propre (ADR 002), et rien ne les
 * supprime quand le dernier article qui les portait disparaît — lire la table
 * brute proposerait donc des tags qui ne ramènent aucun article, c'est-à-dire
 * des impasses dans la sidebar « Popular Tags » du front.
 *
 * L'implémentation reste libre (jointure à la lecture ou purge des orphelins) ;
 * seul le résultat observable est fixé : **tout tag renvoyé ramène au moins un
 * article** (AC-4).
 *
 * Aucun ordre n'est imposé, aucune pagination : le contrat n'en prévoit pas, et
 * le nom « Popular Tags » du front de référence ne suffit pas à inventer un tri
 * par fréquence sur lequel les autres implémentations Conduit ne s'accordent
 * pas.
 *
 * Ce port n'a pas de jumeau en écriture : les tags naissent et meurent avec les
 * articles qui les portent, jamais pour eux-mêmes
 * (REQ-ARTICLE-003 AC-5 les crée et les réutilise).
 */
export interface TagQueryPort {
  /** Tags effectivement portés par au moins un article, sans doublon. */
  listUsed(): Promise<readonly Tag[]>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const TAG_QUERY = Symbol('TagQueryPort')
