import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

/** Port par défaut de l'API. La configuration d'env validée par Zod arrive en Phase 3 (item B1). */
const DEFAULT_PORT = 3001

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  await app.listen(port)
}

void bootstrap()
