import { CONTRACT_MESSAGES, type ErrorResponse, fieldErrors } from '@repo/shared'

/**
 * Pourquoi une requête n'a pas d'identité.
 *
 * `missing` = aucun jeton à examiner (en-tête absent, ou d'un schéma que le
 * contrat n'emploie pas). `invalid` = un jeton nous a été présenté et nous le
 * refusons.
 *
 * Cette distinction-là est sûre, et le contrat l'exige (REQ-ERROR-002 AC-3 et
 * AC-4) : l'appelant sait déjà s'il a envoyé un jeton, on ne lui apprend rien.
 * Ce qui reste fermé, c'est le degré en dessous — les trois causes d'invalidité
 * ne sont pas distinguées entre elles, sans quoi le porteur d'un jeton périmé
 * apprendrait qu'il a déjà été valide.
 */
export type AuthFailure = 'missing' | 'invalid'

/**
 * Corps du 401, conforme au contrat (`errors.token`, REQ-ERROR-002 AC-3/AC-4).
 *
 * Le message dit s'il y avait un jeton, jamais ce qui cloche avec lui :
 * distinguer « expiré » de « mal signé » renseignerait un attaquant sur l'état
 * du jeton qu'il détient.
 *
 * Cette table vit dans son propre module, et non dans le guard, parce qu'elle a
 * **deux** appelants dont l'égalité est une propriété de sécurité : le guard,
 * qui refuse un jeton, et `domain-error.mapper.ts`, qui traduit
 * `authenticated_user_not_found` — le cas d'un jeton parfaitement signé dont le
 * sujet ne résout plus vers un compte (REQ-AUTH-001 AC-6).
 *
 * Les deux corps **doivent** être identiques, sans quoi l'API confirmerait
 * l'existence passée d'un compte à qui présente un jeton périmé. Auparavant
 * chacun construisait le sien à partir de la même entrée de `CONTRACT_MESSAGES`,
 * ce qui laissait la clé `token` dupliquée en littéral des deux côtés. Ils
 * partagent désormais la même valeur : l'égalité est structurelle, elle ne
 * dépend plus de la vigilance de qui touchera l'un des deux.
 */
export const AUTH_ERROR_BODY = {
  missing: fieldErrors('token', CONTRACT_MESSAGES.tokenMissing),
  invalid: fieldErrors('token', CONTRACT_MESSAGES.tokenInvalid),
} satisfies Record<AuthFailure, ErrorResponse>
