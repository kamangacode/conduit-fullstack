import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'

import { AppModule } from './app.module'
import { HealthController } from './interface/health/health.controller'

/**
 * Boot-smoke du graphe d'injection (rule 16, couture DI).
 *
 * Un trou de câblage NestJS ne se voit ni à la compilation ni dans les tests
 * unitaires : chaque use-case testé avec ses ports mockés passe au vert, et
 * c'est le `main.ts` en production qui découvre qu'un provider manque au
 * module. Ce test ferme cet angle mort en compilant le graphe **réel**, sans
 * base de données, et en vérifiant que les collaborateurs sortent non-null.
 *
 * Il reste une ligne à ajouter ici chaque fois qu'un use-case injecté
 * cross-module apparaît — c'est le prix de la seule vérification qui attrape ce
 * type de panne avant le boot.
 */
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

    await moduleRef.close()
  })

  it('rejette la compilation d’un module amputé d’un provider', async () => {
    // Le contrôle anti-tautologie du boot-smoke (rule 12) : les deux assertions
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
