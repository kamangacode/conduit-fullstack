import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'

/**
 * Vérification active du harness : l'injection **par type** de NestJS
 * fonctionne-t-elle dans la lane de test ?
 *
 * Ce n'est pas un test du produit, c'est un test de l'outillage. Il existe
 * parce que la panne qu'il attrape est silencieuse, différée, et sans rapport
 * avec le code qui la révèle. L'injection par type de Nest repose sur
 * `emitDecoratorMetadata` (rule 12) : cette métadonnée est produite par le
 * **transformeur**, pas par le code. Si un jour le transformeur de Vitest cesse
 * de l'émettre — montée de version, changement de moteur — rien ne bouge dans
 * le dépôt, mais `constructor(private readonly repo: ArticleRepository)` devient
 * un `Nest can't resolve dependencies` incompréhensible, alors que le même code
 * continue de tourner en dev et en production, compilés par tsc.
 *
 * Sans cette sonde, la panne se révélerait au premier use-case injecté,
 * c'est-à-dire au moment où l'on cherchera la cause dans le use-case.
 * Le remède, le cas échéant : brancher un transformeur qui émet la métadonnée
 * (`unplugin-swc` dans `vitest.config.ts`). Il n'est pas nécessaire aujourd'hui.
 */

@Injectable()
class Dependency {
  readonly value = 'résolue par type'
}

@Injectable()
class Consumer {
  // Aucun @Inject() explicite : c'est tout l'enjeu. Nest doit déduire le type
  // du paramètre depuis la métadonnée émise à la compilation.
  constructor(readonly dependency: Dependency) {}
}

@Module({ providers: [Dependency, Consumer] })
class MetadataProbeModule {}

describe('harness — métadonnée de décorateurs dans la lane de test', () => {
  it('résout une dépendance par type, sans @Inject() explicite', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetadataProbeModule],
    }).compile()

    const consumer = moduleRef.get(Consumer)

    expect(consumer.dependency).toBeInstanceOf(Dependency)
    expect(consumer.dependency.value).toBe('résolue par type')
  })

  it('expose la métadonnée `design:paramtypes` sur le constructeur', () => {
    // L'assertion précédente pourrait passer par accident si Nest changeait de
    // stratégie de résolution. Celle-ci vise la cause directement : la
    // métadonnée est-elle présente dans le bundle de test ?
    const paramTypes = Reflect.getMetadata('design:paramtypes', Consumer)

    expect(paramTypes).toEqual([Dependency])
  })
})
