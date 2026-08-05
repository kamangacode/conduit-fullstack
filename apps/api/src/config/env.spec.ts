import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

/**
 * Couche `config` : TypeScript pur, zéro mock (rule 16).
 *
 * Ces tests portent sur un garde-fou, donc l'essentiel d'entre eux vérifient
 * qu'il **refuse**. Un validateur d'environnement dont on ne teste que le
 * chemin nominal ne prouve rien : c'est le rejet qui a de la valeur.
 */

/** Base valide minimale, que chaque cas dégrade sur un seul point. */
const validEnv = {
  DATABASE_URL: 'postgresql://conduit:conduit@localhost:5432/conduit_dev?schema=public',
  JWT_SECRET: 'a'.repeat(64),
} as const

describe('parseEnv — chemin nominal', () => {
  it('accepte une configuration minimale et applique les valeurs par défaut', () => {
    const env = parseEnv(validEnv)

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3001)
    expect(env.JWT_EXPIRES_IN).toBe('7d')
  })

  it('convertit PORT en nombre — les variables d’environnement sont des chaînes', () => {
    const env = parseEnv({ ...validEnv, PORT: '8080' })

    // Sans coercition, `app.listen('8080')` fonctionnerait par accident tandis
    // qu'un calcul sur le port produirait une concaténation silencieuse.
    expect(env.PORT).toBe(8080)
    expect(typeof env.PORT).toBe('number')
  })
})

describe('parseEnv — refus', () => {
  it('refuse une DATABASE_URL absente', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = validEnv

    expect(() => parseEnv(withoutDatabase)).toThrow(/DATABASE_URL/)
  })

  it('refuse une DATABASE_URL qui n’est pas une URL PostgreSQL', () => {
    // Le cas réel : une URL MySQL ou un chemin SQLite copié d'un autre projet.
    // Sans ce contrôle, l'erreur n'apparaîtrait qu'à la première requête Prisma.
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/conduit' })).toThrow(
      /PostgreSQL/
    )
  })

  it('refuse un JWT_SECRET trop court', () => {
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: 'trop-court' })).toThrow(/JWT_SECRET/)
  })

  it('refuse un JWT_SECRET absent, sans lui substituer de valeur par défaut', () => {
    // Un secret avec un défaut de développement finit un jour en production.
    // C'est exactement ce que le fail-fast doit rendre impossible.
    const { JWT_SECRET: _omitted, ...withoutSecret } = validEnv

    expect(() => parseEnv(withoutSecret)).toThrow(/JWT_SECRET/)
  })

  it('refuse un NODE_ENV hors énumération', () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })

  it('refuse un PORT hors bornes', () => {
    expect(() => parseEnv({ ...validEnv, PORT: '70000' })).toThrow(/PORT/)
  })

  it('refuse une JWT_EXPIRES_IN au mauvais format', () => {
    expect(() => parseEnv({ ...validEnv, JWT_EXPIRES_IN: 'une semaine' })).toThrow(/JWT_EXPIRES_IN/)
  })
})

describe('parseEnv — qualité du diagnostic', () => {
  it('énumère TOUS les problèmes, pas seulement le premier', () => {
    // Corriger une variable pour découvrir la suivante au redémarrage d'après
    // transforme une mise en service en jeu de piste.
    let message = ''
    try {
      parseEnv({ DATABASE_URL: 'mysql://x', JWT_SECRET: 'court', PORT: 'abc' })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toMatch(/DATABASE_URL/)
    expect(message).toMatch(/JWT_SECRET/)
    expect(message).toMatch(/PORT/)
  })

  it('ne réaffiche jamais la valeur reçue d’un secret', () => {
    // Propriété de sécurité, pas de confort : ce message part sur la sortie
    // standard au démarrage, donc dans les logs de la plateforme — lus par
    // bien plus de monde que la variable elle-même.
    // Valeur volontairement trop courte (donc rejetée) et reconnaissable : si
    // elle apparaissait dans le message, la fuite serait certaine.
    const leakedSecret = 'sk_live_NE_DOIT_PAS_FUITER'
    let message = ''
    try {
      parseEnv({ ...validEnv, JWT_SECRET: leakedSecret })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toMatch(/JWT_SECRET/)
    expect(message).not.toContain(leakedSecret)
  })

  it('renvoie vers le fichier d’exemple plutôt que de laisser chercher', () => {
    expect(() => parseEnv({})).toThrow(/\.env\.example/)
  })
})

/**
 * `CORS_ORIGIN` est le seul champ du schéma qui **transforme** sa valeur plutôt
 * que de la valider seulement. Il était arrivé sans test, et ce que sa
 * transformation produit finit directement dans la liste d'origines autorisées
 * du serveur — une entrée parasite y serait une origine acceptée.
 */
describe('parseEnv — origines CORS', () => {
  it('applique l’origine de développement par défaut', () => {
    expect(parseEnv(validEnv).CORS_ORIGIN).toEqual(['http://localhost:3000'])
  })

  it('découpe une liste séparée par des virgules', () => {
    const env = parseEnv({
      ...validEnv,
      CORS_ORIGIN: 'https://app.example.com,https://admin.example.com',
    })

    expect(env.CORS_ORIGIN).toEqual(['https://app.example.com', 'https://admin.example.com'])
  })

  it('retire les espaces autour de chaque origine', () => {
    // Une origine avec espace de tête ne correspondrait à aucun en-tête `Origin`
    // réel : le navigateur serait bloqué par une configuration qui a pourtant
    // l'air juste dans le fichier `.env`.
    const env = parseEnv({ ...validEnv, CORS_ORIGIN: ' https://a.test , https://b.test ' })

    expect(env.CORS_ORIGIN).toEqual(['https://a.test', 'https://b.test'])
  })

  it('écarte les segments vides plutôt que d’autoriser une origine vide', () => {
    // Une virgule en trop — la faute de frappe la plus banale de ce format —
    // produirait sinon une entrée `''` dans la liste des origines autorisées.
    const env = parseEnv({ ...validEnv, CORS_ORIGIN: 'https://a.test,,https://b.test,' })

    expect(env.CORS_ORIGIN).toEqual(['https://a.test', 'https://b.test'])
  })

  it('rend une liste vide quand la variable est vide, plutôt qu’une origine vide', () => {
    expect(parseEnv({ ...validEnv, CORS_ORIGIN: '' }).CORS_ORIGIN).toEqual([])
  })
})
