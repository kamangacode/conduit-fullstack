import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { type Env, parseEnv } from './config/env'
import { applyHttpConventions } from './interface/http-conventions'

/**
 * Point d'entrée de l'API.
 *
 * L'environnement est validé **avant que le graphe applicatif ne soit chargé**.
 * Une configuration invalide arrête le process avec un message qui nomme les
 * variables fautives, plutôt que de laisser démarrer un serveur qui répondra des
 * 500 dont la cause sera à chercher trois couches plus bas (rule 19).
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
  // `AppModule` est importé **dynamiquement, après la validation**, et ce n'est
  // pas un détail de style : les imports statiques sont hoistés, donc évalués
  // avant la première instruction de `bootstrap()`. Or ce graphe tire
  // `@prisma/client`, qui charge `apps/api/.env` dans `process.env` comme effet
  // de bord de son `require` — un comportement qu'aucune ligne de ce dépôt
  // n'écrit et que rien ne rend visible à la lecture.
  //
  // Avec un import statique, l'ordre réel était donc : `.env` chargé, PUIS
  // validation. Un `.env` oublié dans une image de production comblait
  // silencieusement la variable que la plateforme n'avait pas injectée, et le
  // fail-fast ne se déclenchait jamais — mesuré le 2026-08-08, l'API montait ses
  // 34 routes sans `DATABASE_URL` ni `JWT_SECRET` dans son environnement.
  // `dotenv` n'écrasant pas une variable déjà posée, le risque n'est pas qu'un
  // fichier remplace une valeur légitime, mais qu'il bouche le trou que le
  // fail-fast existe pour signaler.
  //
  // `scripts/verify-env-fail-fast.sh` (REQ-SEC-004) tient cet ordre : sa phase 5
  // soumet au même harnais un point d'entrée à import statique et constate qu'il
  // démarre. Rétablir l'import statique ici fait donc rougir le pre-push et la
  // CI, ce qu'un commentaire seul ne saurait garantir (ADR 025).
  const { AppModule } = await import('./app.module')
  const app = await NestFactory.create(AppModule)
  // Les conventions HTTP sont posées par une fonction partagée avec les tests
  // d'intégration : les écrire ici seulement les rendrait invisibles à une suite
  // qui construit sa propre application (voir `applyHttpConventions`). L'origine
  // CORS vient de l'environnement validé : le navigateur du front en dépend.
  applyHttpConventions(app, { corsOrigin: env.CORS_ORIGIN })
  await app.listen(env.PORT)
}

void bootstrap()
