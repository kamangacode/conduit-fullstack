import { describe, expect, it } from 'vitest'
import { ApiError } from './api-client'
import { CONNECTION_FAILURE_MESSAGE, toMessages } from './errors'

/**
 * Tests écrits depuis les critères de REQ-WEB-017.
 *
 * La traduction des échecs vivait jusqu'ici sans test propre : elle n'était
 * éprouvée qu'à travers les formulaires qui l'appellent. C'est précisément la
 * configuration dans laquelle une divergence passe — chaque formulaire prouve
 * *son* message, aucun ne prouve qu'ils partagent la même source.
 */

describe('REQ-WEB-017 — traduction des échecs de soumission', () => {
  it('AC-1: rend le message d’échec de connexion quand aucune réponse ne revient', () => {
    // Ce que `fetch` lève quand le serveur est injoignable : ni statut, ni
    // corps, donc rien que le contrat §10 puisse décrire.
    expect(toMessages(new TypeError('Failed to fetch'))).toEqual([CONNECTION_FAILURE_MESSAGE])
  })

  it('AC-1: le message nomme la connexion, pas la requête', () => {
    // Formulation fixée par la suite e2e officielle, qui l'assert
    // littéralement : c'est un élément de contrat au même titre qu'un sélecteur.
    expect(CONNECTION_FAILURE_MESSAGE).toContain('Unable to connect')
  })

  it('AC-1: traite de même un corps illisible, qui n’est pas davantage un refus', () => {
    expect(toMessages(new SyntaxError('Unexpected token }'))).toEqual([CONNECTION_FAILURE_MESSAGE])
  })

  it('AC-2: rend les messages par champ de l’API plutôt que le sien', () => {
    // Le piège que ce critère ferme : substituer « impossible de joindre le
    // serveur » à une réponse reçue enverrait chercher une panne réseau à
    // quelqu'un dont le seul problème est un email déjà pris.
    const error = new ApiError(422, { email: ['is already taken'] })

    expect(toMessages(error, { 422: 'invalid input' })).toEqual(['email is already taken'])
  })

  it('AC-3: retombe sur le message générique de la page pour un statut sans détail', () => {
    const error = new ApiError(401, {})

    expect(toMessages(error, { 401: 'your session has expired' })).toEqual([
      'your session has expired',
    ])
  })

  it('AC-3: n’emprunte pas le message de connexion à un statut inconnu de la page', () => {
    // Une réponse *a* été reçue : dire « impossible de joindre le serveur »
    // serait faux, et enverrait diagnostiquer le réseau au lieu du serveur.
    const messages = toMessages(new ApiError(418, {}))

    expect(messages).not.toEqual([CONNECTION_FAILURE_MESSAGE])
    expect(messages).toEqual(['request failed'])
  })
})
