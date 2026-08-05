import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { SHARED_MODEL_VERSION } from '@repo/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HealthModule } from '@/interface/health/health.module'
import { applyHttpConventions, DEFAULT_CORS_ORIGIN } from '@/interface/http-conventions'

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

/**
 * CORS — la seconde convention posée par `applyHttpConventions`, verrouillée pour
 * la même raison que le préfixe : c'est un comportement qu'aucune autre suite ne
 * révèle. supertest n'applique pas la politique CORS d'un navigateur, donc tous
 * les tests HTTP passent au vert même quand l'en-tête `Access-Control-Allow-Origin`
 * est absent. En production, cette absence ne produit pas une panne franche mais
 * un « unable to reach the server » côté front : l'API répond (201), et c'est le
 * navigateur qui rejette la réponse faute de l'en-tête. Seule sa présence le prouve.
 */
describe('conventions CORS partagées', () => {
  let app: INestApplication
  const allowedOrigin = 'https://front.example'

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile()
    app = moduleRef.createNestApplication()
    // Origine explicite : on éprouve le chemin de câblage réel de `main.ts`
    // (origine tirée de l'environnement → en-tête), pas seulement le défaut.
    applyHttpConventions(app, { corsOrigin: allowedOrigin })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('émet Access-Control-Allow-Origin pour l’origine configurée', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', allowedOrigin)
      .expect(200)

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin)
  })

  it('n’accorde pas l’en-tête à une origine non configurée', async () => {
    // La requête aboutit côté serveur — le CORS est une politique navigateur, pas
    // un pare-feu. Ce qui compte : l'origine étrangère ne se voit pas renvoyer son
    // propre nom, donc le navigateur la bloquera.
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://pirate.example')
      .expect(200)

    expect(response.headers['access-control-allow-origin']).not.toBe('https://pirate.example')
  })
})

/**
 * La branche par défaut d'`applyHttpConventions` — `corsOrigin` absent — n'était
 * empruntée par aucune assertion : les deux tests ci-dessus passent toujours une
 * origine explicite, et le premier `describe` ne regardait pas l'en-tête.
 *
 * Le risque pratique est faible (en production `main.ts` fournit toujours
 * `env.CORS_ORIGIN`, qui a lui-même un défaut Zod), mais un repli qu'aucun test
 * n'emprunte est un repli dont on ne sait pas s'il fonctionne — et celui-ci
 * décide quelles origines le navigateur acceptera.
 */
describe('conventions CORS — repli sans options', () => {
  let defaultApp: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile()
    defaultApp = moduleRef.createNestApplication()
    applyHttpConventions(defaultApp)
    await defaultApp.init()
  })

  afterAll(async () => {
    await defaultApp.close()
  })

  it('accorde l’en-tête à l’origine de développement par défaut', async () => {
    const response = await request(defaultApp.getHttpServer())
      .get('/health')
      .set('Origin', DEFAULT_CORS_ORIGIN)
      .expect(200)

    expect(response.headers['access-control-allow-origin']).toBe(DEFAULT_CORS_ORIGIN)
  })
})
