import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'

/**
 * Client Prisma géré par le cycle de vie NestJS.
 *
 * L'URL vient de la **configuration validée** (`ENV`) et non de `process.env` :
 * le client hérite ainsi du fail-fast du démarrage, au lieu de découvrir une URL
 * absente à la première requête — c'est-à-dire loin de la cause (rule 19).
 *
 * `$connect()` est explicite dans `onModuleInit` plutôt que laissé à la connexion
 * paresseuse de Prisma. Sans lui, une base injoignable ne se manifeste qu'à la
 * première requête HTTP, donc après que la plateforme d'hébergement a déclaré
 * l'instance saine et lui a envoyé du trafic. Avec lui, le démarrage échoue —
 * c'est le comportement qu'on veut d'une sonde de readiness (item C5).
 *
 * Ce service est le **seul** point du dépôt qui instancie un `PrismaClient` en
 * production : les adapters le reçoivent par injection. La lane d'intégration a
 * le sien (`test/integration/setup.ts`), délibérément séparé, parce qu'il porte
 * la garde anti-purge.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  /**
   * Ferme le pool à l'arrêt du module. Sans ça, un test qui construit puis
   * détruit une application laisse des connexions ouvertes, et la suite finit
   * par épuiser le nombre maximal de connexions de PostgreSQL — un échec qui
   * apparaît loin du test fautif.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
