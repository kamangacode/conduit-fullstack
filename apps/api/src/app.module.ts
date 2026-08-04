import { Module } from '@nestjs/common'

import { ConfigModule } from './config/config.module'
import { HealthModule } from './interface/health/health.module'

/**
 * Module racine de l'API. Il câble la configuration validée (globale) et la
 * sonde de santé ; les modules de domaine (user, article, comment, profile,
 * tag) arrivent aux issues 3 et 4, chacun respectant les couches hexagonales.
 */
@Module({
  imports: [ConfigModule, HealthModule],
})
export class AppModule {}
