import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { SHARED_MODEL_VERSION } from '@repo/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HealthModule } from '@/interface/health/health.module'
import { applyHttpConventions } from '@/interface/http-prefix'

/**
 * Couche `interface` : contrôleur testé via `Test.createTestingModule` + supertest
 * (rule 16). On monte l'application Nest réelle et on l'interroge par HTTP —
 * seule façon de couvrir ce que la couche apporte vraiment : le routage, la
 * sérialisation, et plus tard les guards et la validation.
 *
 * Cette sonde ne touche pas la base, elle reste donc dans la lane **unit**. Les
 * contrôleurs qui liront ou écriront en base passeront en `*.integration.spec.ts`.
 */
describe('GET /health', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile()
    app = moduleRef.createNestApplication()
    // Mêmes conventions HTTP qu'en production : sans elles, cette suite
    // interrogerait une application configurée autrement que celle qui tourne.
    applyHttpConventions(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('répond 200 avec le contrat de la sonde', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200)

    expect(response.body).toEqual({
      status: 'ok',
      service: 'api',
      sharedModelVersion: SHARED_MODEL_VERSION,
    })
  })

  it('expose la version du modèle partagé résolue depuis @repo/shared', async () => {
    // Assertion volontairement distincte de la précédente : elle documente ce
    // que la sonde prouve au-delà de « le serveur répond » — que la résolution
    // cross-workspace vers @repo/shared tient au runtime, pas seulement à la
    // compilation. Une valeur vide passerait le toEqual ci-dessus si la
    // constante venait à disparaître des deux côtés.
    const response = await request(app.getHttpServer()).get('/health').expect(200)

    expect(response.body.sharedModelVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('reste hors du préfixe /api, contrairement aux routes du contrat', async () => {
    // La sonde est consommée par la plateforme d'hébergement, pas par un client
    // de l'API : la ranger sous `/api` la ferait dépendre d'une convention qui
    // appartient au contrat métier. Ce test verrouille l'exclusion — sans lui,
    // rien ne signalerait qu'elle a disparu avant que la sonde ne tombe en prod.
    await request(app.getHttpServer()).get('/api/health').expect(404)
  })
})
