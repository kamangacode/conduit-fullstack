import { Controller, Get, Inject } from '@nestjs/common'
import { HealthCheck, type HealthCheckResult, HealthCheckService } from '@nestjs/terminus'
import { SHARED_MODEL_VERSION } from '@repo/shared'

import { PrismaHealthIndicator } from '../../infrastructure/health/prisma.health-indicator'

interface HealthResponse {
  status: 'ok'
  service: 'api'
  /** Version du modèle partagé résolue depuis @repo/shared — prouve la résolution cross-workspace. */
  sharedModelVersion: string
}

/**
 * Sondes exposées à la plateforme d'hébergement (REQ-SRE-001, item C5).
 *
 * Trois routes, trois usages distincts :
 *
 * - `GET /health` — sonde minimale de la Phase 0, **conservée telle quelle**.
 *   Elle porte la version du modèle partagé et sert de témoin de résolution
 *   cross-workspace ; des tests et la documentation en dépendent.
 * - `GET /health/live` — **liveness**. Un échec fait *redémarrer* le conteneur.
 * - `GET /health/ready` — **readiness**. Un échec *retire du routage* sans tuer.
 *
 * La distinction n'est pas cosmétique : brancher la base sur la liveness est le
 * défaut classique du dispositif, et il ne se manifeste **que pendant un
 * incident**. La base hoquette, la liveness échoue, l'orchestrateur redémarre
 * l'application — qui repart sans base, échoue encore, et boucle. Le redémarrage
 * n'a jamais aidé (le processus allait bien) et ajoute une panne d'application à
 * une panne de base, au pire moment.
 *
 * Les trois routes restent **hors du préfixe `/api`** : elles sont consommées par
 * la plateforme, pas par un client du contrat RealWorld.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthCheckService) private readonly health: HealthCheckService,
    @Inject(PrismaHealthIndicator) private readonly database: PrismaHealthIndicator
  ) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      sharedModelVersion: SHARED_MODEL_VERSION,
    }
  }

  /**
   * Liveness — « ce processus est-il vivant ? ».
   *
   * La liste d'indicateurs est **vide, et doit le rester**. Y ajouter une
   * dépendance externe transformerait cette sonde en readiness déguisée, avec le
   * pouvoir de tuer le processus. Répondre revient déjà à prouver ce qui est
   * demandé : l'event loop tourne et le serveur HTTP sert.
   */
  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([])
  }

  /**
   * Readiness — « puis-je servir du trafic ? ».
   *
   * Porte les dépendances sans lesquelles une requête métier échouerait. Toute
   * dépendance ajoutée plus tard se range ici, jamais dans la liveness.
   */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.isHealthy()])
  }
}
