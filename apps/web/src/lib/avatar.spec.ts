import { describe, expect, it } from 'vitest'
import { avatarUrl, DEFAULT_AVATAR_URL } from './avatar'

/** Tests écrits depuis les critères de REQ-WEB-007, avant l'implémentation. */

describe('REQ-WEB-007 — avatar par défaut', () => {
  it('AC-3: retombe sur l’avatar par défaut quand l’image est absente', () => {
    expect(avatarUrl(null)).toBe(DEFAULT_AVATAR_URL)
    expect(avatarUrl(undefined)).toBe(DEFAULT_AVATAR_URL)
  })

  it('AC-3: traite la chaîne vide comme une absence, pas comme une URL', () => {
    // Le contrat parle d'une image « null or empty ». Sans ce cas, un compte
    // dont l'image a été effacée dans les paramètres — qui envoie `''`, pas
    // `null` — produirait un `src=""`, c'est-à-dire une requête vers la page
    // courante et une image cassée.
    expect(avatarUrl('')).toBe(DEFAULT_AVATAR_URL)
    expect(avatarUrl('   ')).toBe(DEFAULT_AVATAR_URL)
  })

  it('AC-3: pointe vers le fichier que le contrat de sélecteurs nomme', () => {
    // Les tests E2E asserte que le `src` **contient** `default-avatar.svg` :
    // renommer le fichier vendoré casserait la suite sans casser l'affichage,
    // donc sans que rien ne le signale ici. Ce test est ce signal.
    expect(DEFAULT_AVATAR_URL).toContain('default-avatar.svg')
  })

  it('AC-4: conserve l’image du compte quand elle existe', () => {
    expect(avatarUrl('https://example.test/jake.png')).toBe('https://example.test/jake.png')
  })
})
