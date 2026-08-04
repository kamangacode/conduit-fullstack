import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { type Env, parseEnv } from './config/env'

/**
 * Point d'entrée de l'API.
 *
 * L'environnement est validé **avant** toute autre chose : avant NestJS, avant
 * la moindre connexion. Une configuration invalide arrête le process avec un
 * message qui nomme les variables fautives, plutôt que de laisser démarrer un
 * serveur qui répondra des 500 dont la cause sera à chercher trois couches plus
 * bas (rule 19).
 */
function loadEnvOrExit(): Env {
  try {
    return parseEnv(process.env)
  } catch (error) {
    // `console.error` + `exit(1)` plutôt qu'une exception qui remonte : une
    // stack trace de Zod noierait le seul message utile — la liste des variables
    // à corriger — sous des frames sans intérêt pour qui déploie.
    console.error((error as Error).message)
    process.exit(1)
  }
}

async function bootstrap(): Promise<void> {
  const env = loadEnvOrExit()
  const app = await NestFactory.create(AppModule)
  await app.listen(env.PORT)
}

void bootstrap()
