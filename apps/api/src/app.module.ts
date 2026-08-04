import { Module } from '@nestjs/common'

import { HealthModule } from './interface/health/health.module'

/**
 * Module racine de l'API. En Phase 0 il ne câble que la sonde de santé ; les
 * modules de domaine (user, article, comment, profile, tag) arrivent aux
 * issues 3 et 4, chacun respectant les couches hexagonales.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
