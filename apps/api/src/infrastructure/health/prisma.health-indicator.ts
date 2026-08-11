import { Inject, Injectable } from '@nestjs/common'
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus'

import { PrismaService } from '../prisma/prisma.service'

/**
 * Sonde de disponibilité de la base, pour la **readiness** uniquement
 * (REQ-SRE-001).
 *
 * ## Pourquoi ne pas prendre le `PrismaHealthIndicator` de terminus
 *
 * `@nestjs/terminus` en fournit un. Il exige un client exposant
 * `$queryRawUnsafe` et l'appelle en interne. La requête est constante, donc sans
 * surface d'injection, et le verrou GritQL du dépôt ne lit pas `node_modules` :
 * l'usage passerait sans rien faire rougir.
 *
 * Il n'est pas retenu pour autant. Un dépôt qui interdit cette méthode
 * (ADR 024, REQ-SEC-002) et dont la sonde de santé l'appelle se contredit devant
 * son lecteur — et ce dépôt est lu. L'indicateur est donc écrit sur le point
 * d'extension prévu par terminus (`HealthIndicatorService`), avec la forme
 * paramétrée `$queryRaw`.
 *
 * ## Ce que la sonde mesure, et ce qu'elle ne mesure pas
 *
 * `SELECT 1` prouve qu'une connexion du pool est utilisable et que le serveur
 * répond. Elle ne dit rien du schéma, ni des migrations, ni de la latence des
 * requêtes réelles — trois choses qu'une readiness ne devrait pas mesurer, sous
 * peine de retirer l'instance du routage pour une requête métier lente.
 */
@Injectable()
export class PrismaHealthIndicator {
  constructor(
    @Inject(HealthIndicatorService)
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult<'database'>> {
    const session = this.healthIndicatorService.check('database')

    try {
      // Tagged template : la valeur est liée, jamais concaténée. C'est la forme
      // que l'ADR 024 impose, et la seule que le verrou de lint laisse passer.
      await this.prisma.$queryRaw`SELECT 1`
      return session.up()
    } catch (error) {
      // Le message de l'erreur, pas l'erreur entière : une trace Prisma porte
      // l'URL de connexion, donc des identifiants. Une sonde est un endpoint
      // **non authentifié** consommé par la plateforme — y renvoyer une chaîne
      // de connexion serait une fuite (rule 19).
      return session.down({
        message: error instanceof Error ? error.message : 'base injoignable',
      })
    }
  }
}
