import type { Profile } from '@repo/shared'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api-client'
import ProfilePage from './page'

/**
 * Tests de **page**, écrits en réponse à une revue.
 *
 * Le passage de l'avatar à un rendu inconditionnel change un comportement
 * observable — avant, un compte sans photo n'avait aucune balise `img.user-img`
 * du tout — et rien ne le couvrait : ni `avatar.spec.ts`, qui teste la fonction
 * de repli isolément, ni `Navbar.spec.tsx`, qui teste un autre emplacement. La
 * régression possible est silencieuse : réintroduire `{profile.image && …}`
 * repasserait tous les tests existants au vert.
 *
 * La page est un **Server Component asynchrone** : on l'appelle comme une
 * fonction et on rend l'élément qu'elle retourne, faute de pouvoir la monter.
 */

const getProfile = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api-client')>()),
  createApiClient: () => ({ getProfile }),
}))

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)
vi.mock('next/navigation', () => ({ notFound }))

// `FollowButton` est un composant client qui consomme la session et le client
// API : il a sa propre spec, et le monter ici ferait échouer ces tests pour une
// raison sans rapport avec ce qu'ils vérifient.
vi.mock('../../../components/FollowButton', () => ({
  FollowButton: () => null,
}))

const jacob: Profile = { username: 'jacob', bio: null, image: null, following: false }

const renderPage = async (username = 'jacob') =>
  render(await ProfilePage({ params: Promise.resolve({ username }) }))

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue(jacob)
  notFound.mockClear()
})

describe('REQ-WEB-007 — contrat de sélecteurs, page de profil', () => {
  it('AC-3: rend l’avatar par défaut quand le compte n’a pas d’image', async () => {
    const { container } = await renderPage()

    const avatar = container.querySelector('img.user-img')
    expect(avatar).not.toBeNull()
    expect(avatar?.getAttribute('src')).toContain('default-avatar.svg')
  })

  it('AC-4: rend l’image du compte quand elle existe', async () => {
    getProfile.mockResolvedValue({ ...jacob, image: 'https://example.test/jacob.png' })

    const { container } = await renderPage()

    expect(container.querySelector('img.user-img')).toHaveAttribute(
      'src',
      'https://example.test/jacob.png'
    )
  })
})

describe('REQ-WEB-005 — profil public', () => {
  it('AC-1: rend le username et la bio du compte demandé', async () => {
    getProfile.mockResolvedValue({ ...jacob, bio: 'I work at statefarm' })

    const { container } = await renderPage()

    expect(container.querySelector('.profile-page .user-info h4')).toHaveTextContent('jacob')
    expect(container.querySelector('.user-info p')).toHaveTextContent('I work at statefarm')
  })

  it('AC-6: produit une vraie 404 sur un username inconnu', async () => {
    getProfile.mockRejectedValue(new ApiError(404, {}))

    await expect(renderPage('fantome')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('AC-6: laisse remonter une panne de l’API au lieu de la déguiser en profil absent', async () => {
    // Un 500 traité comme un 404 afficherait « ce compte n'existe pas » pendant
    // une panne — un message faux, et qui envoie l'utilisateur sur une fausse
    // piste au moment le plus coûteux.
    getProfile.mockRejectedValue(new ApiError(500, {}))

    await expect(renderPage()).rejects.toThrow()
    expect(notFound).not.toHaveBeenCalled()
  })
})
