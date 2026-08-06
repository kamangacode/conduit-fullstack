import { CONTRACT_MESSAGES, type ErrorResponse, fieldErrors } from '@repo/shared'
import { DomainError } from '../shared/errors/domain.error'

/**
 * Erreurs métier du contexte `user`.
 *
 * Chaque classe fixe **deux** choses : le code métier (donc le statut, via la
 * table partagée) et le corps §10 renvoyé au client.
 *
 * Les messages viennent de `CONTRACT_MESSAGES` et non de littéraux écrits ici.
 * Ce fichier affirmait auparavant les tenir « verbatim de l'implémentation de
 * référence » ; la première exécution de la suite de conformité a montré que
 * non, sur trois de ses cinq classes. Les exemples d'un fichier OpenAPI
 * illustrent une forme, la suite officielle *est* le contrat — et la table
 * partagée est le seul endroit où cette provenance peut être citée une fois
 * pour toutes (ADR 017).
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
  readonly response: ErrorResponse = fieldErrors('email', CONTRACT_MESSAGES.alreadyTaken)

  constructor() {
    super('email has already been taken')
  }
}

/** Username déjà porté par un autre compte (règle R-8). Même raisonnement. */
export class UsernameAlreadyTakenError extends DomainError {
  readonly errorCode = 'conflict' as const
  readonly response: ErrorResponse = fieldErrors('username', CONTRACT_MESSAGES.alreadyTaken)

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
 *
 * La clé est `credentials` et le message `invalid` (`errors_auth.hurl`). Nous
 * employions `email or password` / `is invalid` : plus explicite, et hors
 * contrat — un front de l'écosystème qui cherche `errors.credentials` n'aurait
 * rien affiché.
 *
 * Le corollaire vaut d'être dit : le use-case de connexion ne doit **jamais**
 * lever `UserNotFoundError` quand l'email est inconnu. C'est l'erreur la plus
 * naturelle à écrire, et c'est précisément la fuite.
 */
export class InvalidCredentialsError extends DomainError {
  readonly errorCode = 'unauthorized' as const
  readonly response: ErrorResponse = fieldErrors(
    'credentials',
    CONTRACT_MESSAGES.credentialsInvalid
  )

  constructor() {
    super('email or password is invalid')
  }
}

/**
 * Compte introuvable, désigné par une **valeur publique** — un username.
 *
 * Usage unique : un profil demandé pour un username qui ne désigne personne
 * (REQ-PROFILE-002 AC-3). Le 404 ne divulgue rien ici, puisque les profils sont
 * consultables sans authentification.
 *
 * Ne pas l'utiliser pour une identité issue d'un jeton : voir
 * `AuthenticatedUserNotFoundError`, dont c'est précisément la raison d'être.
 */
export class UserNotFoundError extends DomainError {
  readonly errorCode = 'not_found' as const
  readonly response: ErrorResponse = fieldErrors('profile', CONTRACT_MESSAGES.notFound)

  constructor() {
    super('user not found')
  }
}

/**
 * L'identité portée par un jeton pourtant valide ne résout plus vers un compte
 * (REQ-AUTH-001 AC-6).
 *
 * Le cas survient dès qu'un compte est supprimé alors que des jetons émis
 * courent encore — y compris dans la fenêtre entre la résolution du guard et
 * l'écriture d'un use-case.
 *
 * **401 et non 404**, avec le corps exact du refus d'un jeton présenté par le
 * guard. C'est le point entier de cette classe : un 404 porteur d'un
 * `errors.profile` distinguerait « ce compte n'existe plus » de « ton jeton ne
 * vaut rien », et rendrait donc l'API capable de confirmer qu'un compte a existé
 * à qui présente un jeton périmé. Le porteur d'un jeton qui ne résout plus
 * obtient exactement ce qu'obtient le porteur d'un jeton forgé.
 *
 * L'égalité doit donc être maintenue avec `unauthorized('invalid')` du guard, et
 * elle l'est parce que les deux lisent la même entrée de `CONTRACT_MESSAGES`.
 * C'est précisément le genre de couple qui divergeait quand chacun portait son
 * propre littéral.
 */
export class AuthenticatedUserNotFoundError extends DomainError {
  readonly errorCode = 'unauthorized' as const
  readonly response: ErrorResponse = fieldErrors('token', CONTRACT_MESSAGES.tokenInvalid)

  constructor() {
    super('authenticated user no longer exists')
  }
}
