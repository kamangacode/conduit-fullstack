import type { ConduitErrorCode, ErrorResponse } from '@repo/shared'

/**
 * Racine des erreurs métier (rule 12).
 *
 * Une erreur de domaine dit **ce qui est faux dans le métier**, jamais comment le
 * transport doit le rapporter. C'est pourquoi elle porte un `ConduitErrorCode` et
 * non un statut HTTP : la traduction en 401/403/404/409/422 est owned par
 * l'infrastructure (`CONDUIT_ERROR_STATUS`, `domain-exception.filter.ts`). Un
 * `404` écrit ici serait du transport qui a fui dans le métier — et rendrait le
 * domaine inutilisable depuis un autre adaptateur (CLI, worker, test).
 *
 * `response` porte le corps §10 parce que le message d'erreur destiné au client
 * est une décision **métier** : c'est le domaine qui sait que l'unicité de
 * l'email se rapporte au champ `email`, pas le filtre HTTP. Le filtre n'a plus
 * qu'à choisir le statut et sérialiser — il ne contient aucune connaissance
 * métier, donc aucune branche à maintenir quand une erreur s'ajoute.
 *
 * Le type `ErrorResponse` vient de `packages/shared` : le contrat d'erreur est un
 * shared kernel, pas une redéfinition côté API (rule 12, Context Mapping).
 */
export abstract class DomainError extends Error {
  /** Code métier, traduit en statut HTTP par l'infrastructure uniquement. */
  abstract readonly errorCode: ConduitErrorCode

  /** Corps de réponse §10, verbatim : `{ errors: { champ: [messages] } }`. */
  abstract readonly response: ErrorResponse

  protected constructor(message: string) {
    super(message)
    // `new.target` désigne la classe réellement instanciée, donc la sous-classe.
    // Sans cette ligne, toutes les erreurs de domaine s'afficheraient sous le nom
    // « Error » dans les traces, ce qui rend un log d'incident illisible.
    this.name = new.target.name
  }
}
