import { Injectable } from '@nestjs/common'
import { Algorithm, hash, verify } from '@node-rs/argon2'
import type { PasswordHasher } from '../../domain/user/ports/password-hasher.port'

/**
 * Paramètres argon2id, alignés sur la recommandation OWASP
 * (`docs/adr/007-authentification-argon2id-jose.md`).
 *
 * Ils sont **encodés dans la chaîne PHC** produite
 * (`$argon2id$v=19$m=19456,t=2,p=1$…`), ce qui a une conséquence pratique
 * importante : durcir ces valeurs plus tard n'invalide aucun condensat existant,
 * puisque chaque condensat porte les paramètres avec lesquels il a été calculé.
 * La migration est donc incrémentale — les anciens mots de passe continuent de
 * se vérifier, les nouveaux sont calculés plus dur.
 */
export const ARGON2_PARAMS = {
  algorithm: Algorithm.Argon2id,
  /** 19 MiB. C'est le coût mémoire qui rend l'attaque par GPU peu rentable. */
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * Adapter argon2id du port `PasswordHasher`.
 *
 * Le port ne mentionne aucun algorithme : tout ce qui est spécifique à argon2
 * vit dans ce fichier, et nulle part ailleurs. C'est ce qui rend vraie la
 * promesse de l'ADR 007 — changer d'algorithme est un changement d'adapter.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_PARAMS)
  }

  /**
   * Compare en temps constant, et **ne lève jamais**.
   *
   * `verify` de la bibliothèque lève sur un condensat qu'elle ne sait pas
   * décoder — cas qui survient dès qu'une ligne a été écrite par un autre
   * algorithme, ou corrompue. Laisser remonter cette exception produirait un 500
   * là où la réponse juste est « ces identifiants ne conviennent pas ».
   *
   * Le contrat du port (`Promise<boolean>`) est donc tenu ici plutôt que délégué
   * à l'appelant : un use-case qui devrait envelopper chaque appel dans un
   * `try/catch` finirait par en oublier un.
   */
  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword, ARGON2_PARAMS)
    } catch {
      return false
    }
  }
}
