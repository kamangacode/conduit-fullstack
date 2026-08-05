import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { profileResponseSchema, userResponseSchema } from '@repo/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '@/app.module'
import { applyHttpConventions } from '@/interface/http-conventions'
import { prismaTestClient } from './setup'

/**
 * Le contrat HTTP, vérifié de bout en bout : application NestJS **réelle**,
 * base **réelle**, aucun mock.
 *
 * C'est le seul niveau qui prouve ce dont les couches inférieures ne peuvent rien
 * dire — les statuts, les enveloppes, la traduction des erreurs de domaine, et le
 * comportement des guards. Un use-case peut être parfaitement testé et l'endpoint
 * répondre 500 parce qu'un filtre n'est pas enregistré.
 *
 * Les réponses sont validées contre les schémas de `packages/shared` plutôt que
 * champ par champ : c'est le même schéma que le front consommera, donc ce qui
 * passe ici est exactement ce qu'il sait lire.
 */

let app: INestApplication
let http: () => ReturnType<typeof request>

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'secret-de-lane-integration-32-car'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  // Mêmes conventions HTTP qu'en production, par la même fonction. Les
  // reproduire à la main ici rendrait cette suite capable de passer au vert sur
  // des chemins que l'application ne sert pas — ce qui s'est produit avant que
  // le préfixe `/api` ne soit posé.
  applyHttpConventions(app)
  await app.init()

  http = () => request(app.getHttpServer())
})

afterAll(async () => {
  await app.close()
})

const credentials = {
  username: 'jake',
  email: 'jake@jake.jake',
  password: 'jakejake',
}

/** Inscrit un compte et rend son jeton — le préalable de presque tous les cas. */
const registerAndLogin = async (overrides: Partial<typeof credentials> = {}) => {
  const body = { ...credentials, ...overrides }
  const response = await http().post('/api/users').send({ user: body }).expect(201)

  return { token: response.body.user.token as string, ...body }
}

describe('REQ-USER-002 — POST /users', () => {
  it('AC-1: répond 201 avec l’enveloppe user du contrat', async () => {
    const response = await http().post('/api/users').send({ user: credentials }).expect(201)

    // 201 et non 200 : `openapi.yml` le déclare explicitement pour cet endpoint,
    // et c'est le seul du contrat à ne pas répondre 200.
    expect(userResponseSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.user.username).toBe('jake')
    expect(response.body.user.bio).toBeNull()
  })

  it('AC-1: renvoie un jeton immédiatement exploitable', async () => {
    const { token } = await registerAndLogin()

    // L'inscription doit ouvrir la session : un jeton qu'il faudrait échanger
    // contre un autre obligerait le front à enchaîner deux appels.
    await http().get('/api/user').set('Authorization', `Token ${token}`).expect(200)
  })

  it('AC-5: ne laisse jamais le mot de passe apparaître dans la réponse', async () => {
    const response = await http().post('/api/users').send({ user: credentials }).expect(201)

    expect(JSON.stringify(response.body)).not.toContain('jakejake')
  })

  it('AC-2: répond 409 avec errors.email sur un email déjà pris', async () => {
    await registerAndLogin()

    const response = await http()
      .post('/api/users')
      .send({ user: { ...credentials, username: 'autre' } })
      .expect(409)

    // 409 et non 422 (ADR 009) : la condition exige d'interroger la base, donc
    // ce n'est pas un échec de validation de forme.
    expect(response.body).toEqual({ errors: { email: ['has already been taken'] } })
  })

  it('AC-3: répond 409 avec errors.username sur un username déjà pris', async () => {
    await registerAndLogin()

    const response = await http()
      .post('/api/users')
      .send({ user: { ...credentials, email: 'autre@jake.jake' } })
      .expect(409)

    expect(response.body).toEqual({ errors: { username: ['has already been taken'] } })
  })

  it('AC-4: répond 422 en nommant les champs invalides, sans préfixe d’enveloppe', async () => {
    const response = await http()
      .post('/api/users')
      .send({ user: { username: 'jake', email: 'pas-un-email', password: 'court' } })
      .expect(422)

    // Les clés sont déballées (`email`, pas `user.email`) : le front doit pouvoir
    // les rapprocher d'un champ de formulaire.
    expect(Object.keys(response.body.errors).sort()).toEqual(['email', 'password'])
  })

  it('AC-4: répond 422 quand l’enveloppe user est absente', async () => {
    const response = await http().post('/api/users').send({}).expect(422)

    expect(response.body.errors).toBeDefined()
  })
})

describe('REQ-USER-003 — POST /users/login', () => {
  it('AC-1: répond 200 et non 201', async () => {
    await registerAndLogin()

    const response = await http()
      .post('/api/users/login')
      .send({ user: { email: credentials.email, password: credentials.password } })
      .expect(200)

    expect(userResponseSchema.safeParse(response.body).success).toBe(true)
  })

  it('AC-2 et AC-3: répond 401 avec un corps identique pour les deux causes', async () => {
    await registerAndLogin()

    const wrongPassword = await http()
      .post('/api/users/login')
      .send({ user: { email: credentials.email, password: 'mauvais' } })
      .expect(401)

    const unknownEmail = await http()
      .post('/api/users/login')
      .send({ user: { email: 'inconnu@jake.jake', password: credentials.password } })
      .expect(401)

    // La propriété qui ferme l'oracle d'existence de compte, vérifiée là où le
    // client l'observe : sur le fil.
    expect(unknownEmail.body).toEqual(wrongPassword.body)
  })

  it('AC-4: répond 422 sur un email malformé, et non 401', async () => {
    // La frontière validation / authentification : un corps invalide n'atteint
    // jamais la vérification du mot de passe.
    await http()
      .post('/api/users/login')
      .send({ user: { email: 'pas-un-email', password: 'jakejake' } })
      .expect(422)
  })
})

describe('REQ-AUTH-001 — vérification du jeton', () => {
  it('AC-1: accepte le préfixe Token', async () => {
    const { token } = await registerAndLogin()

    await http().get('/api/user').set('Authorization', `Token ${token}`).expect(200)
  })

  it('AC-2: refuse le préfixe Bearer, jeton pourtant valide', async () => {
    const { token } = await registerAndLogin()

    // Critère de conformité, pas de sécurité : accepter `Bearer` ne créerait
    // aucune faille, mais rendrait le dépôt non conforme au contrat (PRD §9).
    await http().get('/api/user').set('Authorization', `Bearer ${token}`).expect(401)
  })

  it('AC-3: refuse un jeton dont la signature ne correspond pas', async () => {
    const { token } = await registerAndLogin()

    await http()
      .get('/api/user')
      .set('Authorization', `Token ${token.slice(0, -3)}xyz`)
      .expect(401)
  })

  it('AC-4: refuse une requête sans en-tête d’autorisation', async () => {
    await http().get('/api/user').expect(401)
  })

  it('AC-4: renvoie le corps d’erreur du contrat, pas celui de NestJS', async () => {
    // Les assertions de statut seules laissaient passer un retour au
    // `UnauthorizedException` nu de NestJS, qui produit
    // `{"statusCode":401,"message":"Unauthorized"}` — un corps dépourvu de clé
    // `errors`, sur lequel un front RealWorld affiche une liste vide.
    const response = await http().get('/api/user').expect(401)

    expect(response.body).toEqual({ errors: { authorization: ['is invalid or missing'] } })
  })

  it('AC-6: refuse un jeton valide dont le compte a été supprimé', async () => {
    const { token } = await registerAndLogin()
    await prismaTestClient.user.deleteMany({ where: { username: 'jake' } })

    const response = await http()
      .get('/api/user')
      .set('Authorization', `Token ${token}`)
      .expect(401)

    // Corps STRICTEMENT identique à celui d'un jeton forgé : un 404 porteur d'un
    // `errors.profile` apprendrait au porteur d'un jeton périmé que le compte a
    // existé, ce qui est l'oracle d'existence que tout le design d'erreurs ferme.
    expect(response.body).toEqual({ errors: { authorization: ['is invalid or missing'] } })
  })

  it('AC-6: refuse aussi sur une route qui ne relit pas le compte elle-même', async () => {
    // Le test précédent ne prouve PAS la résolution du guard : `GET /api/user`
    // relit le compte dans son propre use-case, donc il répond 401 même si le
    // guard laissait passer une identité non résolue. Constaté en supprimant les
    // deux lignes de résolution du guard — la suite restait verte.
    //
    // `POST /profiles/:username/follow` est la vraie sonde : rien en aval ne
    // vérifie l'existence du suiveur. Sans la résolution du guard, l'écriture
    // partirait avec un `followerId` fantôme et PostgreSQL lèverait une violation
    // de clé étrangère là où le contrat attend un 401.
    const jake = await registerAndLogin()
    const jacob = await registerAndLogin({ username: 'jacob', email: 'jacob@jake.jake' })
    await prismaTestClient.user.deleteMany({ where: { username: 'jacob' } })

    const response = await http()
      .post(`/api/profiles/${jake.username}/follow`)
      .set('Authorization', `Token ${jacob.token}`)
      .expect(401)

    expect(response.body).toEqual({ errors: { authorization: ['is invalid or missing'] } })
    expect(await prismaTestClient.follow.count()).toBe(0)
  })

  it('AC-6: la mise à jour du compte supprimé répond 401, pas 500', async () => {
    // Le pendant en écriture : la ligne peut disparaître entre la résolution du
    // guard et l'UPDATE. Sans traduction du P2025 de Prisma, l'erreur n'étant pas
    // un `DomainError`, le filtre l'ignorait et le client recevait un 500.
    const { token } = await registerAndLogin()
    await prismaTestClient.user.deleteMany({ where: { username: 'jake' } })

    const response = await http()
      .put('/api/user')
      .set('Authorization', `Token ${token}`)
      .send({ user: { bio: 'peu importe' } })
      .expect(401)

    expect(response.body.errors).toBeDefined()
  })

  it('AC-5: sert une route à authentification optionnelle en anonyme', async () => {
    await registerAndLogin()

    const response = await http().get('/api/profiles/jake').expect(200)

    expect(response.body.profile.following).toBe(false)
  })

  it('AC-5: sert une route optionnelle malgré un jeton invalide, sans 401', async () => {
    await registerAndLogin()

    // Un jeton périmé ne doit pas empêcher de consulter un profil public : le
    // contrat ne prévoit pas de 401 sur ces routes.
    await http().get('/api/profiles/jake').set('Authorization', 'Token nimporte-quoi').expect(200)
  })
})

describe('REQ-USER-004 — GET et PUT /user', () => {
  it('AC-1: renvoie le compte du porteur du jeton, et non un autre', async () => {
    await registerAndLogin()
    const jacob = await registerAndLogin({ username: 'jacob', email: 'jacob@jake.jake' })

    const response = await http()
      .get('/api/user')
      .set('Authorization', `Token ${jacob.token}`)
      .expect(200)

    expect(response.body.user.username).toBe('jacob')
  })

  it('AC-3: ne modifie que le champ fourni', async () => {
    const { token } = await registerAndLogin()

    const response = await http()
      .put('/api/user')
      .set('Authorization', `Token ${token}`)
      .send({ user: { bio: 'I like to skateboard' } })
      .expect(200)

    expect(response.body.user.bio).toBe('I like to skateboard')
    expect(response.body.user.email).toBe('jake@jake.jake')
  })

  it('AC-3: efface un champ envoyé à null, à travers toute la chaîne HTTP', async () => {
    // La sémantique absent-vs-null était testée au domaine, au use-case et au
    // repository — jamais à travers corps JSON → zodEnvelope → contrôleur → use
    // case. Retirer le `.nullable()` du schéma, ou omettre `bio` dans le mapping
    // du contrôleur, laissait toutes les autres assertions vertes.
    const { token } = await registerAndLogin()
    const auth = `Token ${token}`

    await http()
      .put('/api/user')
      .set('Authorization', auth)
      .send({ user: { bio: 'I work at statefarm' } })
      .expect(200)

    const cleared = await http()
      .put('/api/user')
      .set('Authorization', auth)
      .send({ user: { bio: null } })
      .expect(200)

    expect(cleared.body.user.bio).toBeNull()
  })

  it('AC-3: un champ absent du corps n’est pas effacé', async () => {
    // Le pendant indispensable : sans lui, une implémentation qui effacerait
    // TOUT à chaque requête satisferait le test précédent.
    const { token } = await registerAndLogin()
    const auth = `Token ${token}`

    await http()
      .put('/api/user')
      .set('Authorization', auth)
      .send({ user: { bio: 'I work at statefarm' } })
      .expect(200)

    const untouched = await http()
      .put('/api/user')
      .set('Authorization', auth)
      .send({ user: { username: 'jake' } })
      .expect(200)

    expect(untouched.body.user.bio).toBe('I work at statefarm')
  })

  it('AC-4: la rotation du mot de passe invalide l’ancien', async () => {
    const { token } = await registerAndLogin()

    await http()
      .put('/api/user')
      .set('Authorization', `Token ${token}`)
      .send({ user: { password: 'nouveau-secret' } })
      .expect(200)

    await http()
      .post('/api/users/login')
      .send({ user: { email: credentials.email, password: 'nouveau-secret' } })
      .expect(200)

    await http()
      .post('/api/users/login')
      .send({ user: { email: credentials.email, password: credentials.password } })
      .expect(401)
  })

  it('AC-5: répond 409 sur un email déjà porté par un autre compte', async () => {
    const jake = await registerAndLogin()
    await registerAndLogin({ username: 'jacob', email: 'jacob@jake.jake' })

    await http()
      .put('/api/user')
      .set('Authorization', `Token ${jake.token}`)
      .send({ user: { email: 'jacob@jake.jake' } })
      .expect(409)
  })

  it('AC-6: accepte que le compte resoumette ses propres valeurs', async () => {
    const { token } = await registerAndLogin()

    // Le formulaire de réglages du front RealWorld renvoie tout le profil : ce
    // cas est le chemin nominal, pas un cas limite.
    await http()
      .put('/api/user')
      .set('Authorization', `Token ${token}`)
      .send({ user: { email: credentials.email, username: credentials.username } })
      .expect(200)
  })

  it('AC-2: refuse les deux routes sans jeton', async () => {
    await http().get('/api/user').expect(401)
    await http()
      .put('/api/user')
      .send({ user: { bio: 'x' } })
      .expect(401)
  })
})

describe('REQ-PROFILE-002 — consultation d’un profil', () => {
  it('AC-1: renvoie l’enveloppe profile du contrat', async () => {
    await registerAndLogin()

    const response = await http().get('/api/profiles/jake').expect(200)

    expect(profileResponseSchema.safeParse(response.body).success).toBe(true)
    // Aucune donnée privée dans une réponse publique.
    expect(JSON.stringify(response.body)).not.toContain('jake@jake.jake')
  })

  it('AC-3: répond 404 sur un username inconnu', async () => {
    await http().get('/api/profiles/personne').expect(404)
  })
})

/**
 * `describe` distinct par exigence — la convention de la rule 20 impose **un
 * seul** identifiant de REQ par bloc racine.
 *
 * Ces cas vivaient d'abord dans un `describe('REQ-PROFILE-002 et 003 …')`, et le
 * générateur de matrice n'en retenait que le premier : les critères propres à
 * PROFILE-003 étaient rattachés à PROFILE-002, où ils n'existent pas, et donc
 * silencieusement perdus. La couverture affichait 98 % au lieu de 100 % sans dire
 * pourquoi — c'est ce qui a permis de retrouver l'erreur.
 */
describe('REQ-PROFILE-003 — suivre et ne plus suivre', () => {
  it('AC-1 et AC-3: suivre puis ne plus suivre bascule following', async () => {
    await registerAndLogin()
    const jacob = await registerAndLogin({ username: 'jacob', email: 'jacob@jake.jake' })
    const auth = `Token ${jacob.token}`

    const followed = await http()
      .post('/api/profiles/jake/follow')
      .set('Authorization', auth)
      .expect(200)
    expect(followed.body.profile.following).toBe(true)

    const seen = await http().get('/api/profiles/jake').set('Authorization', auth).expect(200)
    expect(seen.body.profile.following).toBe(true)

    const unfollowed = await http()
      .delete('/api/profiles/jake/follow')
      .set('Authorization', auth)
      .expect(200)
    expect(unfollowed.body.profile.following).toBe(false)
  })

  it('AC-2 et AC-4: les deux opérations sont idempotentes', async () => {
    await registerAndLogin()
    const jacob = await registerAndLogin({ username: 'jacob', email: 'jacob@jake.jake' })
    const auth = `Token ${jacob.token}`

    await http().post('/api/profiles/jake/follow').set('Authorization', auth).expect(200)
    await http().post('/api/profiles/jake/follow').set('Authorization', auth).expect(200)

    await http().delete('/api/profiles/jake/follow').set('Authorization', auth).expect(200)
    await http().delete('/api/profiles/jake/follow').set('Authorization', auth).expect(200)
  })

  it('AC-5: refuse suivre et ne plus suivre sans jeton', async () => {
    await registerAndLogin()

    await http().post('/api/profiles/jake/follow').expect(401)
    await http().delete('/api/profiles/jake/follow').expect(401)
  })

  it('AC-6: répond 404 quand la cible à suivre n’existe pas', async () => {
    const { token } = await registerAndLogin()

    await http()
      .post('/api/profiles/personne/follow')
      .set('Authorization', `Token ${token}`)
      .expect(404)
  })
})
