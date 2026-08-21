import {
  CONTRACT_MESSAGES,
  type ConduitErrorCode,
  type ErrorResponse,
  fieldErrors,
} from '@repo/shared'
import type { DomainErrorCode, DomainErrorReason } from '../../domain/shared/errors/domain.error'
import { AUTH_ERROR_BODY } from '../auth/auth-error'

/**
 * Traduction du vocabulaire métier vers le vocabulaire du contrat.
 *
 * C'est **le seul endroit** du dépôt où les deux se rencontrent (ADR 031). Le
 * domaine porte un `DomainErrorCode` et une `DomainErrorReason` ; le contrat
 * porte un `ConduitErrorCode`, un statut et un corps §10. Ce fichier fait le
 * pont, et il vit dans `interface/` parce que c'est du transport.
 *
 * Le corps §10 était auparavant porté par les classes d'erreur elles-mêmes, dans
 * `domain/`. Le libellé « has already been taken » et la clé `credentials` sont
 * des choix de la spec RealWorld : les laisser dans le domaine rendait ce
 * dernier dépendant du contrat, et forçait une modification métier à chaque
 * évolution de forme.
 */

/**
 * Un code métier vaut un code de contrat, aujourd'hui un pour un.
 *
 * La table paraît tautologique et ne l'est pas : elle est le point où les deux
 * vocabulaires peuvent diverger sans que le domaine bouge. Le jour où le contrat
 * distinguerait deux formes de conflit, seule cette table changerait.
 */
const CONTRACT_CODE = {
  validation_failed: 'validation_failed',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
} satisfies Record<DomainErrorCode, ConduitErrorCode>

/**
 * Corps §10 de chaque situation métier.
 *
 * `satisfies Record<DomainErrorReason, ErrorResponse>` porte la garantie
 * d'exhaustivité : **ajouter une raison au domaine sans lui donner un corps ici
 * ne compile pas.** C'est le remplacement exact de la propriété que donnait
 * l'ancien `abstract readonly response` — on ne pouvait pas l'oublier parce que
 * la classe la portait, on ne peut pas l'oublier parce que la table est
 * exhaustive.
 *
 * `authenticated_user_not_found` ne construit pas son corps : il **réutilise**
 * celui du refus de jeton du guard. Voir `auth-error.ts` pour la raison de
 * sécurité, qui est le point le plus important de ce fichier.
 */
const RESPONSE = {
  article_not_found: fieldErrors('article', CONTRACT_MESSAGES.notFound),
  article_not_owned: fieldErrors('article', CONTRACT_MESSAGES.forbidden),
  comment_not_found: fieldErrors('comment', CONTRACT_MESSAGES.notFound),
  comment_not_owned: fieldErrors('comment', CONTRACT_MESSAGES.forbidden),
  email_already_taken: fieldErrors('email', CONTRACT_MESSAGES.alreadyTaken),
  username_already_taken: fieldErrors('username', CONTRACT_MESSAGES.alreadyTaken),
  invalid_credentials: fieldErrors('credentials', CONTRACT_MESSAGES.credentialsInvalid),
  user_not_found: fieldErrors('profile', CONTRACT_MESSAGES.notFound),
  authenticated_user_not_found: AUTH_ERROR_BODY.invalid,
} satisfies Record<DomainErrorReason, ErrorResponse>

/** Code de contrat correspondant à un code métier. */
export const toContractCode = (code: DomainErrorCode): ConduitErrorCode => CONTRACT_CODE[code]

/** Corps §10 correspondant à une situation métier. */
export const toErrorBody = (reason: DomainErrorReason): ErrorResponse => RESPONSE[reason]
