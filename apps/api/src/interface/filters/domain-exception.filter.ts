import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import { CONDUIT_ERROR_STATUS } from '@repo/shared'
import type { Response } from 'express'
import { DomainError } from '../../domain/shared/errors/domain.error'
import { toContractCode, toErrorBody } from './domain-error.mapper'

/**
 * Traduit une erreur de domaine en réponse HTTP.
 *
 * C'est **le seul endroit** du dépôt où un code métier devient un statut, et
 * c'est ce qui permet au domaine et aux use-cases d'ignorer HTTP entièrement.
 *
 * Le filtre ne contient **aucune connaissance métier** : pas de `switch` sur les
 * types d'erreur, pas de message écrit ici. Il délègue les deux traductions à
 * `domain-error.mapper.ts` et sérialise. Conséquence directe : ajouter une
 * erreur de domaine demain ne demandera pas de toucher à ce fichier — l'oubli le
 * plus courant, qui produit un 500 pour une situation métier parfaitement
 * prévue.
 *
 * Les deux tables du mapper sont exhaustives par construction
 * (`satisfies Record<…>`), donc une raison ou un code sans traduction ne compile
 * pas. Il n'y a pas de branche de repli à écrire ici : elle serait morte.
 *
 * Ce fichier vivait dans `infrastructure/filters/` jusqu'au 2026-08-21. Il en a
 * été sorti parce qu'il est du transport de bout en bout — statut HTTP, corps
 * §10, `Response` Express — et que le laisser là aurait obligé à autoriser
 * `@repo/shared` dans `infrastructure/`, c'est-à-dire à écrire une règle de
 * frontière à trou (ADR 031).
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    response
      .status(CONDUIT_ERROR_STATUS[toContractCode(exception.errorCode)])
      .json(toErrorBody(exception.reason))
  }
}
