import { afterEach, describe, expect, it } from 'vitest'
import { formatDate } from './format-date'

/**
 * Tests écrits **en réponse à une revue** : le fuseau horaire était le vecteur
 * de divergence d'hydratation resté ouvert alors que la locale, elle, avait été
 * figée avec le bon raisonnement.
 */

const originalTz = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTz
})

describe('REQ-WEB-011 — date affichée', () => {
  it('AC-1: rend le jour du fuseau UTC, quel que soit le fuseau d’exécution', () => {
    // 23 h 30 UTC : à Tokyo (UTC+9) c'est déjà le lendemain. Sans `timeZone`
    // figé, le serveur (souvent en UTC) et un lecteur en fuseau positif
    // n'affichent pas la même date, et React signale une divergence
    // d'hydratation. La date choisie est donc celle qui distingue les deux.
    const nearMidnightUtc = '2016-02-18T23:30:00.000Z'

    process.env.TZ = 'UTC'
    const asUtc = formatDate(nearMidnightUtc)

    process.env.TZ = 'Asia/Tokyo'
    const asTokyo = formatDate(nearMidnightUtc)

    expect(asUtc).toBe('February 18, 2016')
    expect(asTokyo).toBe(asUtc)
  })

  it('AC-1: fige aussi la locale, pour la même raison', () => {
    // Un lecteur francophone verrait « 18 février 2016 » si le format flottait.
    expect(formatDate('2016-02-18T03:22:56.637Z')).toBe('February 18, 2016')
  })
})
