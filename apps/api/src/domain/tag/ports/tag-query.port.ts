/**
 * Nom d'un tag, dans le vocabulaire du dépôt.
 *
 * Un alias de `string` n'ajoute aucune sécurité de type, et ce n'est pas son
 * objet : il nomme ce que la valeur est, et il coupe l'import du contrat. Le
 * port importait jusqu'ici `Tag` de `@repo/shared` pour obtenir... `string` —
 * `z.infer<typeof z.string().trim().min(1)>`. C'était le cas le plus révélateur
 * de la dérive corrigée par l'ADR 031, parce qu'il ne pouvait se défendre ni par
 * la performance ni par la cohérence de forme. Il ne restait que l'habitude : le
 * type venait de `shared`, donc on l'importait de `shared`.
 *
 * Le jour où un tag deviendrait un value object validé, le changement se ferait
 * ici seulement.
 */
export type TagName = string

/**
 * Port de lecture des tags (REQ-TAG-002).
 *
 * Le contexte `tag` n'a ni agrégat, ni invariant, ni entité : ce dossier ne
 * contient que ce port. C'est un contexte pauvre, et il l'est parce que la spec
 * RealWorld ne demande rien de plus qu'une liste de noms (REQ-TAG-002).
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
  listUsed(): Promise<readonly TagName[]>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const TAG_QUERY = Symbol('TagQueryPort')
