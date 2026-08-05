/**
 * Port de hachage de mot de passe (ADR 007).
 *
 * Volontairement ignorant de l'algorithme : ni « argon2 » ni aucun paramètre
 * n'apparaît dans cette signature. C'est ce qui permet à l'ADR 007 d'annoncer
 * qu'un changement d'algorithme est un changement d'adapter — la promesse ne tient
 * que si le port ne fuit rien de l'implémentation.
 *
 * `verify` prend le condensat **et** le candidat, plutôt que d'exposer un `hash`
 * que l'appelant comparerait lui-même. Une comparaison de condensats écrite à la
 * main avec `===` s'interrompt au premier octet différent et fuit de
 * l'information par le temps de réponse ; la garder à l'intérieur de l'adapter
 * rend cette erreur impossible à commettre depuis un use-case.
 */
export interface PasswordHasher {
  /** Produit un condensat auto-descriptif (sel et paramètres inclus). */
  hash(plainPassword: string): Promise<string>

  /** Compare en temps constant. Ne lève pas sur un condensat illisible : renvoie `false`. */
  verify(passwordHash: string, plainPassword: string): Promise<boolean>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const PASSWORD_HASHER = Symbol('PasswordHasher')
