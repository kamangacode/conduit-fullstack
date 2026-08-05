/**
 * Port de la relation de suivi (REQ-PROFILE-003).
 *
 * La relation est **orientée** : `followerId` suit `followingId`, et l'inverse
 * est une autre relation. Les deux paramètres portent donc des noms qui disent
 * lequel est lequel — un couple `(a, b)` d'identifiants du même type est le genre
 * de signature qu'on inverse un jour sans que rien ne le signale.
 *
 * `follow` et `unfollow` sont **idempotents** par contrat : suivre deux fois n'est
 * pas une erreur, ne plus suivre quelqu'un qu'on ne suit pas non plus. Le contrat
 * RealWorld ne prévoit aucun code d'erreur pour ces cas, parce que l'endpoint
 * exprime un état voulu et non une transition. Cette propriété est portée par la
 * clé composite `(followerId, followingId)` du schéma Prisma, donc par la base :
 * un contrôle applicatif préalable laisserait une fenêtre de course entre la
 * lecture et l'écriture, et rendrait le doublon possible sous concurrence.
 */
export interface FollowRepository {
  isFollowing(followerId: string, followingId: string): Promise<boolean>

  /** Idempotent : ne lève pas si la relation existe déjà. */
  follow(followerId: string, followingId: string): Promise<void>

  /** Idempotent : ne lève pas si la relation n'existe pas. */
  unfollow(followerId: string, followingId: string): Promise<void>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const FOLLOW_REPOSITORY = Symbol('FollowRepository')
