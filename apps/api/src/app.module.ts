import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'

import { ConfigModule } from './config/config.module'
import { DomainExceptionFilter } from './infrastructure/filters/domain-exception.filter'
import { ArticleModule } from './interface/article/article.module'
import { HealthModule } from './interface/health/health.module'
import { ProfileModule } from './interface/profile/profile.module'
import { TagModule } from './interface/tag/tag.module'
import { UserModule } from './interface/user/user.module'

/**
 * Module racine de l'API. Il câble la configuration validée (globale), la sonde
 * de santé, et les contextes livrés : `user` et `profile` (item F2), puis
 * `article`, `comment` et `tag` (item F3). Tous respectent les mêmes couches
 * hexagonales — le domaine ignore NestJS, les use-cases ignorent Prisma, et
 * chaque module est le seul endroit où un port rencontre son adapter.
 *
 * `DomainExceptionFilter` est enregistré via `APP_FILTER` plutôt que
 * `app.useGlobalFilters()` dans `main.ts` : déclaré comme provider, il passe par
 * l'injection et se retrouve donc **aussi** dans les applications construites par
 * `Test.createTestingModule`. Un filtre posé dans `main.ts` serait absent des
 * tests d'intégration, qui verraient des 500 là où la production renvoie des 404
 * ou des 409 — l'écart de comportement le plus trompeur qui soit, puisqu'il rend
 * les tests plus sévères que la réalité sur un point et aveugles sur un autre.
 */
@Module({
  imports: [ConfigModule, HealthModule, UserModule, ProfileModule, ArticleModule, TagModule],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
