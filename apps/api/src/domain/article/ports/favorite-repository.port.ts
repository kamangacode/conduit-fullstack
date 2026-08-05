/**
 * Port de la relation de favori (REQ-ARTICLE-009).
 *
 * Le favori est au couple `(userId, articleId)` ce que le suivi est au couple
 * `(followerId, followingId)` : une relation binaire qu'on établit et qu'on
 * retire, et dont l'existence est l'état — pas la transition.
 *
 * `favorite` et `unfavorite` sont donc **idempotents** par contrat : favoriser
 * deux fois n'est pas une erreur, défavoriser ce qu'on n'a jamais favorisé non
 * plus (AC-2 et AC-4). Ce n'est pas une commodité : le bouton du front est
 * optimiste, si bien qu'un double-clic ou une reprise réseau produisent
 * naturellement deux appels identiques. Une API qui répondrait 409 au second
 * obligerait chaque client à distinguer « déjà fait » de « échec », alors que le
 * résultat visé est atteint dans les deux cas.
 *
 * La propriété est portée par la **clé composite** `(userId, articleId)` du
 * schéma Prisma, donc par la base : un contrôle applicatif préalable laisserait
 * une fenêtre de course entre la lecture et l'écriture, et rendrait le doublon
 * possible sous concurrence. Aucune méthode de ce port ne demande donc « est-ce
 * déjà favorisé ? » — la question n'a pas de réponse utile entre deux requêtes.
 *
 * Ni `favoritesCount` ni `favorited` ne sont ici : ce sont des **lectures**,
 * servies par `ArticleQueryPort` qui les calcule depuis cette même table
 * (`docs/adr/011-lecture-des-listes-port-dedie.md`). Les faire renvoyer par
 * l'écriture rouvrirait la porte au compteur dénormalisé que l'ADR 002 a refusé.
 */
export interface FavoriteRepository {
  /** Idempotent : ne lève pas si l'article est déjà favorisé. */
  favorite(userId: string, articleId: string): Promise<void>

  /** Idempotent : ne lève pas si l'article n'était pas favorisé. */
  unfavorite(userId: string, articleId: string): Promise<void>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const FAVORITE_REPOSITORY = Symbol('FavoriteRepository')
