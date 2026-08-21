import { describe, expect, it } from 'vitest'
import type { DomainErrorReason } from '../../domain/shared/errors/domain.error'
import { AUTH_ERROR_BODY } from '../auth/auth-error'
import { toContractCode, toErrorBody } from './domain-error.mapper'

/**
 * Le corps §10 était porté par les classes d'erreur de `domain/` jusqu'au
 * 2026-08-21 (ADR 031). En le déplaçant ici, on déplace aussi le risque : un
 * corps qui changerait au passage serait une régression de contrat invisible en
 * revue, puisque aucune signature ne bouge.
 *
 * Ces attentes sont donc écrites **en littéraux**, et non dérivées de
 * `CONTRACT_MESSAGES`. Les dériver rendrait le test tautologique : il passerait
 * quel que soit le libellé, y compris faux. Ce sont les valeurs exactes que la
 * suite de conformité officielle assert (`errors_auth.hurl`,
 * `errors_articles.hurl`, `errors_comments.hurl`, `errors_authorization.hurl`).
 */

const EXPECTED_BODIES: Record<DomainErrorReason, unknown> = {
  article_not_found: { errors: { article: ['not found'] } },
  article_not_owned: { errors: { article: ['forbidden'] } },
  comment_not_found: { errors: { comment: ['not found'] } },
  comment_not_owned: { errors: { comment: ['forbidden'] } },
  email_already_taken: { errors: { email: ['has already been taken'] } },
  username_already_taken: { errors: { username: ['has already been taken'] } },
  invalid_credentials: { errors: { credentials: ['invalid'] } },
  user_not_found: { errors: { profile: ['not found'] } },
  authenticated_user_not_found: { errors: { token: ['is invalid'] } },
}

describe('REQ-ERROR-001 — corps §10 produit par la couche interface', () => {
  it.each(Object.keys(EXPECTED_BODIES) as DomainErrorReason[])(
    'AC-1: %s produit le corps que le contrat exige',
    (reason) => {
      expect(toErrorBody(reason)).toEqual(EXPECTED_BODIES[reason])
    }
  )

  it('AC-1: le corps porte toujours des tableaux de messages, jamais un message seul', () => {
    // La forme §10 est `{ errors: { champ: [messages] } }`. Un champ associé à
    // une chaîne au lieu d'un tableau passerait le typage de `ErrorResponse`
    // nulle part, mais casserait un front qui itère — et la suite Hurl le
    // verrait sur une seule route au lieu de neuf.
    for (const reason of Object.keys(EXPECTED_BODIES) as DomainErrorReason[]) {
      for (const messages of Object.values(toErrorBody(reason).errors)) {
        expect(Array.isArray(messages)).toBe(true)
        expect(messages.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('REQ-ERROR-002 — le vocabulaire métier se traduit en vocabulaire de contrat', () => {
  it('AC-1: chaque code métier a son code de contrat', () => {
    expect(toContractCode('validation_failed')).toBe('validation_failed')
    expect(toContractCode('unauthorized')).toBe('unauthorized')
    expect(toContractCode('forbidden')).toBe('forbidden')
    expect(toContractCode('not_found')).toBe('not_found')
    expect(toContractCode('conflict')).toBe('conflict')
  })
})

describe('REQ-AUTH-001 — un jeton périmé est indistinguable d’un jeton forgé', () => {
  it('AC-6: le corps de `authenticated_user_not_found` est celui du refus de jeton du guard', () => {
    // La propriété de sécurité centrale de ce fichier. Si les deux corps
    // divergeaient, l'API confirmerait l'existence passée d'un compte à qui
    // présente un jeton dont le sujet ne résout plus.
    //
    // L'égalité est aujourd'hui structurelle — les deux lisent `AUTH_ERROR_BODY`
    // — et ce test n'est donc pas là pour la découvrir mais pour l'empêcher
    // d'être défaite : quiconque réinlinerait un littéral ici verrait rouge.
    expect(toErrorBody('authenticated_user_not_found')).toEqual(AUTH_ERROR_BODY.invalid)
  })

  it('AC-6: il se distingue en revanche du refus pour jeton absent', () => {
    // L'autre moitié de la règle : « je n'ai pas vu de jeton » et « je refuse
    // ton jeton » sont deux messages différents, et le contrat l'exige
    // (REQ-ERROR-002 AC-3/AC-4). Fusionner les deux au motif de la prudence
    // casserait la conformité.
    expect(toErrorBody('authenticated_user_not_found')).not.toEqual(AUTH_ERROR_BODY.missing)
  })
})
