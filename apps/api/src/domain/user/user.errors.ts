import { type ErrorResponse, fieldErrors } from '@repo/shared'
import { DomainError } from '../shared/errors/domain.error'

/**
 * Erreurs métier du contexte `user`.
 *
 * Chaque classe fixe **deux** choses : le code métier (donc le statut, via la
 * table partagée) et le corps §10 renvoyé au client. Les messages sont repris
 * verbatim de l'implémentation de référence RealWorld et des exemples
 * d'`openapi.yml`, parce que plusieurs front-ends de l'écosystème les affichent
 * tels quels — les reformuler en français dégraderait l'interopérabilité sans
 * rien apporter.
 */

/**
 * Email déjà porté par un autre compte (règle R-8).
 *
 * Code `conflict` (409) et non `validation_failed` : la condition ne peut pas
 * être vérifiée par un schéma, elle exige d'interroger la base
 * (`docs/adr/009-conflit-unicite-409.md`).
 */
export class EmailAlreadyTakenError extends DomainError {
  readonly errorCode = 'conflict' as const
  readonly response: ErrorResponse = fieldErrors('email', 'has already been taken')

  constructor() {
    super('email has already been taken')
  }
}

/** Username déjà porté par un autre compte (règle R-8). Même raisonnement. */
export class UsernameAlreadyTakenError extends DomainError {
  readonly errorCode = 'conflict' as const
  readonly response: ErrorResponse = fieldErrors('username', 'has already been taken')

  constructor() {
    super('username has already been taken')
  }
}

/**
 * Identifiants de connexion refusés.
 *
 * **Un seul type d'erreur pour deux causes** — email inconnu et mot de passe
 * erroné — et c'est délibéré (REQ-USER-003 AC-3). Distinguer les deux ferait de
 * l'API un oracle répondant à « ce compte existe-t-il ? » sans authentification.
 * Le message générique `email or password / is invalid` est celui de
 * l'implémentation de référence.
 *
 * Le corollaire vaut d'être dit : le use-case de connexion ne doit **jamais**
 * lever `UserNotFoundError` quand l'email est inconnu. C'est l'erreur la plus
 * naturelle à écrire, et c'est précisément la fuite.
 */
export class InvalidCredentialsError extends DomainError {
  readonly errorCode = 'unauthorized' as const
  readonly response: ErrorResponse = fieldErrors('email or password', 'is invalid')

  constructor() {
    super('email or password is invalid')
  }
}

/**
 * Compte introuvable.
 *
 * Deux usages seulement, tous deux hors connexion : un profil demandé par un
 * username qui ne désigne personne (REQ-PROFILE-002 AC-3), et un jeton dont le
 * sujet ne se résout plus (REQ-AUTH-001 AC-6) — ce dernier cas étant traduit en
 * 401 par le use-case appelant, puisque le porteur du jeton n'a pas à savoir si
 * le compte a existé.
 */
export class UserNotFoundError extends DomainError {
  readonly errorCode = 'not_found' as const
  readonly response: ErrorResponse = fieldErrors('profile', 'not found')

  constructor() {
    super('user not found')
  }
}
