/**
 * Contrat d'accès au registre des clés d'idempotence (REQ-IDEM-001, ADR 027).
 *
 * Ce port vit dans `interface/` et non dans `domain/`, contrairement aux ports
 * métier du dépôt. C'est délibéré : l'idempotence ne parle pas d'articles ni de
 * commentaires, elle parle de **requêtes répétées** — une préoccupation de
 * transport, au même titre que l'authentification portée par un guard. Le mettre
 * dans le domaine y ferait entrer une notion HTTP que la [rule 12] en exclut.
 *
 * L'adapter Prisma l'implémente depuis `infrastructure/`, exactement comme il
 * implémente les ports du domaine. La règle de dépendance n'est pas violée :
 * elle interdit qu'une couche **interne** dépende d'une couche externe, et
 * `interface` comme `infrastructure` sont toutes deux externes.
 */

/** Token d'injection — le port est une interface, effacée à la compilation. */
export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore')

/**
 * Ce qui identifie une tentative, et qui doit être stable d'un rejeu à l'autre.
 *
 * `userId` fait partie de l'identité et non du contenu : sans lui, deux comptes
 * choisissant la même chaîne se serviraient mutuellement leurs réponses.
 */
export interface IdempotencyIdentity {
  readonly userId: string
  /** Méthode et motif de route (`POST /api/articles`), jamais l'URL concrète. */
  readonly endpoint: string
  readonly key: string
  /** Empreinte du corps, pour distinguer un rejeu d'une clé réutilisée à tort. */
  readonly fingerprint: string
}

/**
 * Verdict de la réservation. Les quatre cas sont exhaustifs et mutuellement
 * exclusifs, ce qui permet à l'intercepteur de les traiter par un `switch` sans
 * branche par défaut — une cinquième situation ne compilerait pas.
 */
export type ReservationOutcome =
  /** La clé est à nous : exécuter, puis attacher la réponse. */
  | { readonly kind: 'reserved' }
  /** Une réponse existe déjà pour cette clé : la resservir telle quelle. */
  | { readonly kind: 'replay'; readonly status: number; readonly body: unknown }
  /** Une autre requête détient la clé et n'a pas encore répondu → 409. */
  | { readonly kind: 'in-flight' }
  /** Clé connue, corps différent : bug client → 422. */
  | { readonly kind: 'payload-mismatch' }

export interface IdempotencyStore {
  /**
   * Tente de prendre la clé. L'écriture précède l'exécution : c'est la
   * contrainte d'unicité de la base qui tranche la concurrence, pas une lecture
   * suivie d'une écriture — laquelle laisserait ouverte la fenêtre exacte que le
   * double-clic exploite (même raisonnement que l'ADR 010 sur le slug).
   */
  reserve(identity: IdempotencyIdentity): Promise<ReservationOutcome>

  /** Attache la réponse à une clé réservée, une fois la requête aboutie. */
  complete(identity: IdempotencyIdentity, status: number, body: unknown): Promise<void>

  /**
   * Libère une clé réservée dont la requête a échoué.
   *
   * Contrepartie obligatoire de la réservation anticipée : une clé consommée par
   * un échec interdirait la reprise, c'est-à-dire l'usage même d'une clé
   * d'idempotence (REQ-IDEM-001 AC-6).
   */
  release(identity: IdempotencyIdentity): Promise<void>
}
