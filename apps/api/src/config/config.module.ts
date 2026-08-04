import { Global, Module } from '@nestjs/common'

import { type Env, parseEnv } from './env'

/**
 * Jeton d'injection de la configuration validée.
 *
 * Passer par l'injection plutôt que par des lectures de `process.env` disséminées
 * a une conséquence concrète : une variable oubliée devient une erreur au
 * démarrage plutôt qu'un `undefined` qui traverse trois couches avant de se
 * manifester. C'est aussi ce qui permet à un test de fournir sa propre
 * configuration sans toucher à l'environnement du process.
 */
export const ENV = Symbol('ENV')

/**
 * Expose la configuration validée à tout le graphe d'injection.
 *
 * `@Global()` parce que la configuration est transverse : l'alternative — la
 * réimporter dans chaque module de domaine — ajouterait du bruit sans ajouter
 * de garantie.
 *
 * La validation a déjà eu lieu dans `main.ts`, avant même la création de
 * l'application : ce module ne fait que rendre le résultat injectable. En
 * contexte de test, `Test.createTestingModule` l'instancie sans passer par
 * `main.ts`, donc la fabrique revalide — c'est voulu, une configuration
 * invalide doit faire échouer un test comme elle ferait échouer un boot.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => parseEnv(process.env),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
