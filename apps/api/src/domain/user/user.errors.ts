import { DomainError } from '../shared/errors/domain.error'

/**
 * Erreurs métier du contexte `user`.
 *
 * Chaque classe fixe **deux** choses, toutes deux métier : le code
 * (`DomainErrorCode`) et la raison (`DomainErrorReason`). Ni statut HTTP, ni
 * clé de champ, ni libellé : le corps §10 est produit par
 * `interface/filters/domain-error.mapper.ts` (ADR 031).
 *
 * Les libellés eux-mêmes restent tenus par `CONTRACT_MESSAGES` dans
 * `packages/shared`, lu désormais par le mapper. Ce fichier affirmait autrefois
 * les tenir « verbatim de l'implémentation de référence » ; la première
 * exécution de la suite de conformité a montré que non, sur trois de ses cinq
 * classes. Les exemples d'un fichier OpenAPI illustrent une forme, la suite
 * officielle *est* le contrat, et la table partagée reste le seul endroit où
 * cette provenance est citée une fois pour toutes (ADR 017).
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
  readonly reason = 'email_already_taken' as const

  constructor() {
    super('email has already been taken')
  }
}

/** Username déjà porté par un autre compte (règle R-8). Même raisonnement. */
export class UsernameAlreadyTakenError extends DomainError {
  readonly errorCode = 'conflict' as const
  readonly reason = 'username_already_taken' as const

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
 * Le corps rendu (clé `credentials`, message `invalid`, `errors_auth.hurl`) est
 * l'affaire du mapper. Ce qui se décide ici est plus fort et ne dépend d'aucun
 * transport : **une seule raison** pour les deux causes, donc aucun aval ne peut
 * les distinguer même s'il le voulait.
 *
 * Le corollaire vaut d'être dit : le use-case de connexion ne doit **jamais**
 * lever `UserNotFoundError` quand l'email est inconnu. C'est l'erreur la plus
 * naturelle à écrire, et c'est précisément la fuite.
 */
export class InvalidCredentialsError extends DomainError {
  readonly errorCode = 'unauthorized' as const
  readonly reason = 'invalid_credentials' as const

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
  readonly reason = 'user_not_found' as const

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
 * **401 et non 404**, et le corps rendu doit être exactement celui du refus d'un
 * jeton présenté par le guard. C'est le point entier de cette classe : un 404
 * porteur d'un `errors.profile` distinguerait « ce compte n'existe plus » de
 * « ton jeton ne vaut rien », et rendrait donc l'API capable de confirmer qu'un
 * compte a existé à qui présente un jeton périmé. Le porteur d'un jeton qui ne
 * résout plus obtient exactement ce qu'obtient le porteur d'un jeton forgé.
 *
 * L'égalité avec `unauthorized('invalid')` du guard est une propriété de
 * **sécurité**, et elle est désormais garantie côté `interface/` : le mapper et
 * le guard produisent le même corps, et une assertion dédiée de
 * `domain-error.mapper.spec.ts` le vérifie plutôt que de l'espérer. Elle
 * reposait auparavant sur le fait que les deux lisaient la même entrée de
 * `CONTRACT_MESSAGES`, ce qui était vrai mais que rien ne testait.
 */
export class AuthenticatedUserNotFoundError extends DomainError {
  readonly errorCode = 'unauthorized' as const
  readonly reason = 'authenticated_user_not_found' as const

  constructor() {
    super('authenticated user no longer exists')
  }
}
