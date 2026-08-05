import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import type { Env } from '../../config/env'
import { JoseTokenService } from './jose-token.service'

const SECRET = 'secret-de-test-de-32-caracteres!!'
const OTHER_SECRET = 'un-autre-secret-de-32-caracteres!'

const anEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'test',
    PORT: 3001,
    DATABASE_URL: 'postgresql://localhost:5432/conduit_test',
    JWT_SECRET: SECRET,
    JWT_EXPIRES_IN: '7d',
    ...overrides,
  }) as Env

const service = new JoseTokenService(anEnv())

describe('REQ-AUTH-001 — émission et vérification du jeton', () => {
  it('AC-1: restitue le sujet du jeton qu’il a émis', async () => {
    const token = await service.issue('c0ffee00-0000-4000-8000-000000000001')

    expect(await service.verify(token)).toBe('c0ffee00-0000-4000-8000-000000000001')
  })

  it('AC-1: émet des jetons distincts pour des comptes distincts', async () => {
    const [first, second] = await Promise.all([
      service.issue('compte-a'),
      service.issue('compte-b'),
    ])

    expect(await service.verify(first)).toBe('compte-a')
    expect(await service.verify(second)).toBe('compte-b')
  })

  it('AC-1: ne place aucune donnée personnelle dans la charge utile', async () => {
    // Un JWT est signé, pas chiffré : sa charge utile est lisible par quiconque
    // l'intercepte, et par le navigateur qui le stocke en localStorage (PRD §9).
    const token = await service.issue('c0ffee00-0000-4000-8000-000000000001')
    const [, payloadSegment] = token.split('.')
    const payload = JSON.parse(Buffer.from(payloadSegment ?? '', 'base64url').toString())

    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub'])
  })

  it('AC-3: refuse un jeton signé avec un autre secret', async () => {
    const foreign = new JoseTokenService(anEnv({ JWT_SECRET: OTHER_SECRET }))
    const token = await foreign.issue('compte-a')

    expect(await service.verify(token)).toBeNull()
  })

  it('AC-3: refuse un jeton dont la charge utile a été modifiée', async () => {
    const token = await service.issue('compte-a')
    const [header, , signature] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url')

    expect(await service.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull()
  })

  it('AC-3: refuse un jeton expiré', async () => {
    // Le jeton est signé à la main avec une expiration dans le passé : plus
    // fiable qu'une attente réelle, qui rendrait le test lent et sensible à la
    // charge de la machine. `service` suffit — `verify` ne consulte pas
    // `JWT_EXPIRES_IN`, qui ne concerne que l'émission. Une version antérieure
    // instanciait ici un service à `'1s'`, ce qui donnait à lire que la durée
    // configurée était sous test alors que le paramètre n'était jamais lu.
    const token = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('compte-a')
      .setIssuedAt(0)
      .setExpirationTime(1)
      .sign(new TextEncoder().encode(SECRET))

    expect(await service.verify(token)).toBeNull()
  })

  it('AC-1: émet le jeton avec la durée de vie configurée', async () => {
    // La couverture qui manquait réellement : rien n'assertait qu'`issue()`
    // honore `JWT_EXPIRES_IN`. Un `'365d'` écrit en dur dans l'adapter laissait
    // toute la suite verte, et les jetons survivaient en silence à leur fenêtre.
    const shortLived = new JoseTokenService(anEnv({ JWT_EXPIRES_IN: '60s' }))

    const token = await shortLived.issue('compte-a')
    const [, payloadSegment] = token.split('.')
    const { iat, exp } = JSON.parse(Buffer.from(payloadSegment ?? '', 'base64url').toString())

    expect(exp - iat).toBe(60)
  })

  it('AC-1: une durée différente produit une expiration différente', async () => {
    // Le contrôle qui empêche le test précédent d'être satisfait par une
    // constante : deux configurations doivent donner deux fenêtres.
    const [short, long] = await Promise.all([
      new JoseTokenService(anEnv({ JWT_EXPIRES_IN: '60s' })).issue('compte-a'),
      new JoseTokenService(anEnv({ JWT_EXPIRES_IN: '2h' })).issue('compte-a'),
    ])

    const lifetime = (token: string): number => {
      const { iat, exp } = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()
      )
      return exp - iat
    }

    expect(lifetime(short)).toBe(60)
    expect(lifetime(long)).toBe(7200)
  })

  it('AC-3: refuse un jeton présentant un algorithme non attendu', async () => {
    // La faille JWT la plus répandue : accepter l'algorithme annoncé par le
    // jeton. `algorithms: ['HS256']` est ce qui la ferme, et ce test le prouve.
    const unsecured = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: 'admin' })
    ).toString('base64url')}.`

    expect(await service.verify(unsecured)).toBeNull()
  })

  it('AC-3: refuse une chaîne qui n’est pas un jeton', async () => {
    expect(await service.verify('pas-un-jeton')).toBeNull()
    expect(await service.verify('')).toBeNull()
  })

  it('AC-3: refuse un jeton correctement signé mais dépourvu de sujet', async () => {
    // Étiqueté AC-3 (jeton invalide) et non AC-6. AC-6 porte sur un jeton dont
    // le sujet **ne résout vers aucun compte**, ce qui se joue dans le guard,
    // contre la base — pas ici. Sous l'ancienne étiquette, ce test créditait un
    // critère qu'il ne vérifiait pas, et la résolution en base du guard passait
    // pour couverte alors qu'on pouvait la supprimer sans faire rougir la suite.
    //
    // `jwtVerify` accepte un tel jeton : sans le contrôle explicite du `sub`, le
    // guard recevrait une identité vide et la propagerait.
    const token = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(SECRET))

    expect(await service.verify(token)).toBeNull()
  })
})
