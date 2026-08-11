import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { PrismaHealthIndicator } from '../../infrastructure/health/prisma.health-indicator'
import { UserModule } from '../user/user.module'
import { HealthController } from './health.controller'

/**
 * Câblage des sondes de plateforme (REQ-SRE-001).
 *
 * `UserModule` est importé pour la seule `PrismaService`, exactement comme
 * `TagModule` et pour la même raison : la redéclarer ici ouvrirait un second pool
 * de connexions. Le jour où cette dépendance transverse deviendra gênante, la
 * réponse sera un `PersistenceModule` global, pas une duplication.
 *
 * **Conséquence sur les tests, assumée.** Ce module contient désormais
 * `PrismaService`, dont `onModuleInit` appelle `$connect()`. Le monter tel quel
 * dans la lane unit ferait donc tenter une connexion à une base que cette lane
 * n'a pas, par construction (rule 16). `health.controller.spec.ts` compose donc
 * le contrôleur directement — `TerminusModule` + `HealthController` + un
 * indicateur doublé — et c'est le **boot-smoke DI** qui couvre le câblage réel de
 * ce module, ce qui est précisément son rôle : le seul niveau de test qui voit le
 * graphe de production.
 */
@Module({
  imports: [TerminusModule, UserModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
