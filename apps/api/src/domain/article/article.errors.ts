import { type ErrorResponse, fieldErrors } from '@repo/shared'
import { DomainError } from '../shared/errors/domain.error'

/**
 * Erreurs métier du contexte `article`.
 *
 * Même parti pris que le contexte `user` : chaque classe fixe le code métier
 * (donc le statut, via la table partagée) et le corps §10, et les messages sont
 * repris de l'implémentation de référence RealWorld pour rester interopérables
 * avec les front-ends de l'écosystème.
 */

/**
 * Aucun article ne porte ce slug (REQ-ARTICLE-004 AC-3).
 *
 * Levée **avant** toute vérification de propriété : un 403 sur une ressource
 * absente affirmerait son existence, et un contrôle de propriété sur `null`
 * planterait. L'ordre « existence puis permission » est celui de
 * REQ-ARTICLE-005 AC-5 et REQ-ARTICLE-006 AC-4.
 */
export class ArticleNotFoundError extends DomainError {
  readonly errorCode = 'not_found' as const
  readonly response: ErrorResponse = fieldErrors('article', 'not found')

  constructor() {
    super('article not found')
  }
}

/**
 * L'appelant est authentifié, l'article existe, mais il ne lui appartient pas
 * (règle R-6 ; REQ-ARTICLE-005 AC-4, REQ-ARTICLE-006 AC-3).
 *
 * **403 et non 404**, contrairement à la consigne anti-IDOR générique : les
 * articles de Conduit sont publiquement lisibles sans authentification, donc
 * leur existence n'est pas une information protégée et le 403 ne divulgue rien
 * qu'un `GET` anonyme ne donne déjà (`docs/adr/008-permission-manquante-403.md`).
 *
 * L'exception porte sur le **code renvoyé**, jamais sur la vérification :
 * l'appartenance reste filtrée dans la requête elle-même, et non par une lecture
 * suivie d'une comparaison en mémoire (rule 19).
 */
export class ArticleNotOwnedError extends DomainError {
  readonly errorCode = 'forbidden' as const
  readonly response: ErrorResponse = fieldErrors('article', 'is not yours to modify')

  constructor() {
    super('article does not belong to the current user')
  }
}
