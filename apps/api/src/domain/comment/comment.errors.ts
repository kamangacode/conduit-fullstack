import { CONTRACT_MESSAGES, type ErrorResponse, fieldErrors } from '@repo/shared'
import { DomainError } from '../shared/errors/domain.error'

/**
 * Erreurs métier du contexte `comment`. Même parti pris que `user` et
 * `article` : code métier + corps §10, aucun statut HTTP (rule 12), messages
 * pris à `CONTRACT_MESSAGES` (ADR 017).
 */

/**
 * Aucun commentaire ne correspond (REQ-COMMENT-004 AC-3 et AC-4).
 *
 * **Deux causes, une seule erreur**, et c'est délibéré : l'identifiant ne
 * désigne rien, ou il désigne un commentaire rattaché à un autre article que
 * celui du chemin. Les distinguer donnerait à qui énumère les identifiants
 * — ils sont séquentiels, ADR 004 — un oracle indiquant lesquels existent
 * ailleurs. Comme pour `InvalidCredentialsError`, l'indistinction est la
 * propriété, pas un raccourci.
 */
export class CommentNotFoundError extends DomainError {
  readonly errorCode = 'not_found' as const
  readonly response: ErrorResponse = fieldErrors('comment', CONTRACT_MESSAGES.notFound)

  constructor() {
    super('comment not found')
  }
}

/**
 * L'appelant est authentifié, le commentaire existe, mais il ne l'a pas écrit
 * (règle R-6 ; REQ-COMMENT-004 AC-2).
 *
 * **403 et non 404** : les commentaires sont publiquement lisibles, donc leur
 * existence n'est pas une information protégée
 * (`docs/adr/008-permission-manquante-403.md`). C'est ce critère qui paie la
 * dette contractée par l'ADR 004 en rendant les identifiants énumérables — la
 * lecture est publique de toute façon, seule l'écriture doit être gardée.
 *
 * Le message est le **même** que celui de l'article, seule la clé change
 * (`errors_authorization.hurl`). C'est le contrat qui le veut ainsi : ce qui
 * identifie la ressource est la clé, pas le libellé.
 */
export class CommentNotOwnedError extends DomainError {
  readonly errorCode = 'forbidden' as const
  readonly response: ErrorResponse = fieldErrors('comment', CONTRACT_MESSAGES.forbidden)

  constructor() {
    super('comment does not belong to the current user')
  }
}
