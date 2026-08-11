import type { INestApplication } from '@nestjs/common'
import { HealthIndicatorService, TerminusModule } from '@nestjs/terminus'
import { Test } from '@nestjs/testing'
import { SHARED_MODEL_VERSION } from '@repo/shared'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PrismaHealthIndicator } from '@/infrastructure/health/prisma.health-indicator'
import { HealthController } from '@/interface/health/health.controller'
import { applyHttpConventions, DEFAULT_CORS_ORIGIN } from '@/interface/http-conventions'

/**
 * Le contrôleur est **composé** ici, plutôt que monté via `HealthModule`.
 *
 * Depuis l'item C5, ce module contient `PrismaService`, dont `onModuleInit`
 * appelle `$connect()` : l'importer ferait tenter une connexion à une base que la
 * lane unit n'a pas, par construction (rule 16). Ce qu'on éprouve ici est le
 * comportement HTTP des sondes — routage, codes, forme de la réponse — pas le
 * câblage du module, que le **boot-smoke DI** couvre sur le graphe de production.
 *
 * L'indicateur de base est donc toujours doublé, y compris pour les suites qui
 * ne s'intéressent pas à lui : c'est ce qui garde cette lane DB-free.
 */
const anIndicator = (isUp: () => boolean) => ({
  isHealthy: async () => {
    const session = new HealthIndicatorService().check('database')
    return isUp() ? session.up() : session.down({ message: 'connexion refusée' })
  },
})

const createHealthTestingModule = (indicator: ReturnType<typeof anIndicator>) =>
  Test.createTestingModule({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [{ provide: PrismaHealthIndicator, useValue: indicator }],
  })

/** Doublure par défaut, pour les suites qui n'éprouvent pas la base. */
const databaseAlwaysUp = anIndicator(() => true)

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
    const moduleRef = await createHealthTestingModule(databaseAlwaysUp).compile()
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
 * Sondes de plateforme (item C5). La plateforme d'hébergement pose **deux
 * questions différentes**, et leur donne deux conséquences opposées : un échec de
 * liveness fait **redémarrer** le conteneur, un échec de readiness le **retire du
 * routage** sans le tuer.
 *
 * D'où un indicateur de base doublé plutôt qu'une vraie base : ce qu'on éprouve
 * ici n'est pas que PostgreSQL répond, c'est **quelle sonde en dépend**. Le
 * doubler permet de tenir les deux sondes dans le même état du monde, ce qu'une
 * base réelle ne permettrait pas sans l'éteindre au milieu de la suite. La lane
 * unit reste DB-free (rule 16).
 */
describe('REQ-SRE-001 — sondes de plateforme', () => {
  let app: INestApplication
  /** Piloté par chaque test : c'est la panne de base, rendue observable. */
  let databaseIsUp = true

  beforeAll(async () => {
    const moduleRef = await createHealthTestingModule(anIndicator(() => databaseIsUp)).compile()
    app = moduleRef.createNestApplication()
    applyHttpConventions(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    databaseIsUp = true
  })

  it('AC-1: /health/live répond 200 sans interroger la base', async () => {
    // Base explicitement en panne : si la liveness la consultait, ce test
    // rougirait. C'est la moitié de la preuve — l'autre est AC-4.
    databaseIsUp = false

    const response = await request(app.getHttpServer()).get('/health/live').expect(200)

    expect(response.body.status).toBe('ok')
    // Aucun indicateur de base ne doit apparaître : sa seule présence signalerait
    // que la sonde a été câblée dessus, même si elle répond `up` ce jour-là.
    expect(JSON.stringify(response.body)).not.toContain('database')
  })

  it('AC-2: /health/ready répond 200 et nomme la base quand elle répond', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200)

    expect(response.body.status).toBe('ok')
    expect(response.body.info?.database?.status).toBe('up')
  })

  it('AC-3: /health/ready répond 503 et nomme la base en défaut', async () => {
    databaseIsUp = false

    const response = await request(app.getHttpServer()).get('/health/ready').expect(503)

    expect(response.body.status).toBe('error')
    // Nommer l'indicateur fautif, pas seulement échouer : une 503 anonyme
    // laisserait chercher lequel des futurs indicateurs a lâché.
    expect(response.body.error?.database?.status).toBe('down')
  })

  it('AC-4: la liveness reste 200 pendant que la readiness est 503', async () => {
    // Le critère qui porte l'exigence. AC-1 et AC-3 passeraient tous deux sur une
    // implémentation où les deux sondes seraient câblées à l'identique — il
    // suffirait que la base soit disponible dans l'un et absente dans l'autre.
    // Seule l'interrogation des deux sondes **dans le même état du monde** montre
    // qu'elles ne répondent pas à la même question.
    //
    // Le défaut que ça attrape ne se manifeste que pendant un incident : une
    // liveness branchée sur la base fait redémarrer l'application en boucle
    // exactement quand la base est déjà en peine.
    databaseIsUp = false

    await request(app.getHttpServer()).get('/health/ready').expect(503)
    await request(app.getHttpServer()).get('/health/live').expect(200)
  })

  it('AC-5: les deux sondes restent hors du préfixe /api', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(404)
    await request(app.getHttpServer()).get('/api/health/ready').expect(404)
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
    const moduleRef = await createHealthTestingModule(databaseAlwaysUp).compile()
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
    const moduleRef = await createHealthTestingModule(databaseAlwaysUp).compile()
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
