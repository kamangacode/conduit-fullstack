import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppModule } from './app.module'
import { ENV } from './config/config.module'
import { HealthController } from './interface/health/health.controller'

/**
 * Boot-smoke du graphe d'injection (rule 16, couture DI) et de la configuration.
 *
 * Un trou de câblage NestJS ne se voit ni à la compilation ni dans les tests
 * unitaires : chaque use-case testé avec ses ports mockés passe au vert, et
 * c'est le `main.ts` en production qui découvre qu'un provider manque au
 * module. Ces tests ferment cet angle mort en compilant le graphe **réel**,
 * sans base de données.
 */

// Secrets « bare-env » posés avant la compilation du graphe (rule 12) : la
// configuration est validée à l'instanciation du module, donc un graphe qui
// compile prouve aussi que l'environnement tient. Valeurs synthétiques.
beforeEach(() => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgresql://conduit:conduit@localhost:5432/conduit_test?schema=public'
  )
  vi.stubEnv('JWT_SECRET', 'x'.repeat(64))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AppModule — boot smoke DI', () => {
  it('compile le graphe complet sans base de données', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    expect(moduleRef).toBeDefined()
    await moduleRef.close()
  })

  it('résout ses collaborateurs non-null', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // `.compile()` réussirait même si un provider était mal câblé mais jamais
    // demandé : c'est la résolution effective qui prouve le câblage.
    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController)
    // La configuration validée est injectable depuis le graphe : c'est ce qui
    // permettra aux use-cases de la recevoir plutôt que de lire `process.env`.
    expect(moduleRef.get(ENV)).toMatchObject({ NODE_ENV: expect.any(String), PORT: 3001 })

    await moduleRef.close()
  })

  it('rejette la compilation d’un module amputé d’un provider', async () => {
    // Le contrôle anti-tautologie du boot-smoke (rule 12) : les assertions
    // ci-dessus passeraient tout aussi bien si `.compile()` ne vérifiait rien.
    // Celle-ci prouve que la compilation échoue **réellement** quand une
    // dépendance manque — donc que le vert des précédentes a une valeur.
    @Injectable()
    class MissingProvider {}

    @Injectable()
    class NeedsMissingProvider {
      constructor(readonly missing: MissingProvider) {}
    }

    @Module({ providers: [NeedsMissingProvider] })
    class AmputatedModule {}

    await expect(
      Test.createTestingModule({ imports: [AmputatedModule] }).compile()
    ).rejects.toThrow(/Nest can't resolve dependencies/)
  })
})

describe('AppModule — fail-fast de configuration', () => {
  it('refuse de compiler avec une configuration d’environnement invalide', async () => {
    // Le fail-fast de la rule 19, vérifié sur le graphe réel : sans cette
    // assertion, rien ne distinguerait « la configuration est validée au boot »
    // de « la configuration est lue au boot ».
    vi.stubEnv('JWT_SECRET', 'trop-court')

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      /JWT_SECRET/
    )
  })
})
