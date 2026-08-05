/**
 * Port d'émission et de vérification du jeton d'authentification (ADR 007,
 * REQ-AUTH-001).
 *
 * `verify` renvoie **l'identifiant du sujet ou `null`**, jamais la charge utile
 * décodée. Ce choix ferme la faille classique du JWT : exposer le payload
 * inviterait un appelant à y lire un rôle ou un identifiant sans se demander si
 * la signature a été vérifiée. Ici, obtenir la valeur *est* la preuve qu'elle
 * l'a été.
 *
 * `null` plutôt qu'une exception, parce que l'échec de vérification n'est pas
 * exceptionnel : c'est le cas nominal d'une route à authentification optionnelle,
 * où un jeton absent ou périmé produit une consultation anonyme et non une erreur
 * (REQ-AUTH-001 AC-5). La distinction entre « invalide » et « expiré » n'est pas
 * remontée : le contrat répond 401 dans les deux cas, et détailler la raison
 * renseignerait un attaquant sur l'état de son jeton.
 */
export interface TokenService {
  /** Émet un jeton dont le sujet est `userId`, sans y placer aucune donnée personnelle. */
  issue(userId: string): Promise<string>

  /** Renvoie l'identifiant du sujet si le jeton est authentique et non expiré, sinon `null`. */
  verify(token: string): Promise<string | null>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const TOKEN_SERVICE = Symbol('TokenService')
