import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import { CONDUIT_ERROR_STATUS } from '@repo/shared'
import type { Response } from 'express'
import { DomainError } from '../../domain/shared/errors/domain.error'

/**
 * Traduit une erreur de domaine en réponse HTTP.
 *
 * C'est **le seul endroit** du dépôt où un code métier devient un statut, et
 * c'est ce qui permet au domaine et aux use-cases d'ignorer HTTP entièrement
 * (rule 12).
 *
 * Le filtre ne contient **aucune connaissance métier** : pas de `switch` sur les
 * types d'erreur, pas de message écrit ici. Le statut vient de la table partagée
 * `CONDUIT_ERROR_STATUS` (donc du contrat, `packages/shared`), et le corps est
 * porté par l'erreur elle-même. Conséquence directe : ajouter une erreur de
 * domaine demain ne demandera pas de toucher à ce fichier — l'oubli le plus
 * courant, qui produit un 500 pour une situation métier parfaitement prévue.
 *
 * La table étant exhaustive par construction (`satisfies Record<ConduitErrorCode,
 * number>`), un code sans statut ne compile pas. Il n'y a donc pas de branche de
 * repli à écrire ici : elle serait morte.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    response.status(CONDUIT_ERROR_STATUS[exception.errorCode]).json(exception.response)
  }
}
