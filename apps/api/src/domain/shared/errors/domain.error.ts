/**
 * Codes métier des erreurs de domaine.
 *
 * Volontairement **distinct** de `ConduitErrorCode` de `@repo/shared`, dont il
 * duplique aujourd'hui les valeurs. Les deux vocabulaires coïncident, ils n'ont
 * aucune raison de rester liés : le domaine dit « conflit », le contrat dit
 * « 409 ». Importer le type du contrat pour nommer un état métier remettrait le
 * transport dans le domaine par la porte du typage (ADR 031).
 *
 * La correspondance vers `ConduitErrorCode`, et donc vers un statut HTTP, vit
 * dans `interface/filters/domain-error.mapper.ts`.
 */
export type DomainErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'

/**
 * Ce qui s'est passé, du point de vue du métier.
 *
 * Une raison n'est ni un message ni une clé de champ : c'est l'identité de la
 * situation métier. `email_already_taken` dit que l'unicité de l'email est
 * violée ; que cela se rapporte au champ `email` du contrat et se lise
 * « has already been taken » est une décision de transport, prise par le mapper.
 *
 * Cette liste fermée est ce qui remplace l'ancien `response: ErrorResponse`
 * porté par chaque classe. La garantie d'exhaustivité ne disparaît pas, elle se
 * déplace : la table du mapper est déclarée
 * `satisfies Record<DomainErrorReason, ErrorResponse>`, donc ajouter une raison
 * sans son corps ne compile pas.
 */
export type DomainErrorReason =
  | 'article_not_found'
  | 'article_not_owned'
  | 'comment_not_found'
  | 'comment_not_owned'
  | 'email_already_taken'
  | 'username_already_taken'
  | 'invalid_credentials'
  | 'user_not_found'
  | 'authenticated_user_not_found'

/**
 * Racine des erreurs métier.
 *
 * Une erreur de domaine dit **ce qui est faux dans le métier**, jamais comment
 * le transport doit le rapporter. Elle porte donc un `DomainErrorCode` et une
 * `DomainErrorReason`, et rien d'autre : ni statut HTTP, ni corps de réponse.
 * La traduction en 401/403/404/409/422 et en corps §10 est owned par
 * `interface/filters/` (`domain-error.mapper.ts` et `domain-exception.filter.ts`).
 *
 * Une version antérieure de ce fichier portait `response: ErrorResponse`, le
 * corps §10 verbatim, au motif que « le message d'erreur destiné au client est
 * une décision métier ». Ce raisonnement contredisait le paragraphe qui le
 * précédait, lequel refusait le statut HTTP dans le domaine au motif inverse.
 * Refuser le code et accepter le corps, c'est arbitrer deux fois en sens opposé
 * sur la même frontière (ADR 031). Le libellé « has already been taken » et la
 * clé `credentials` sont des choix du contrat RealWorld, pas des règles de
 * Conduit : le domaine n'a pas à changer si un second client les rapporte
 * autrement.
 */
export abstract class DomainError extends Error {
  /** Code métier, traduit en statut HTTP par la couche interface uniquement. */
  abstract readonly errorCode: DomainErrorCode

  /** Situation métier, traduite en corps §10 par la couche interface uniquement. */
  abstract readonly reason: DomainErrorReason

  protected constructor(message: string) {
    super(message)
    // `new.target` désigne la classe réellement instanciée, donc la sous-classe.
    // Sans cette ligne, toutes les erreurs de domaine s'afficheraient sous le nom
    // « Error » dans les traces, ce qui rend un log d'incident illisible.
    this.name = new.target.name
  }
}
