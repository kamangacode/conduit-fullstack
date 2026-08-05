import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PopularTags } from './PopularTags'

/** Tests écrits depuis les critères de REQ-WEB-009, avant l'implémentation. */

const getTags = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api-client')>()),
  createApiClient: () => ({ getTags }),
}))

/** Server Component asynchrone : on l'appelle, puis on rend ce qu'il retourne. */
const renderTags = async () => render(await PopularTags())

beforeEach(() => {
  getTags.mockReset().mockResolvedValue(['dragons', 'training'])
})

describe('REQ-WEB-009 — barre latérale des tags', () => {
  it('AC-4: rend chaque tag comme un lien vers sa page', async () => {
    const { container } = await renderTags()

    expect(container.querySelectorAll('.sidebar .tag-list a.tag-pill.tag-default')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'dragons' })).toHaveAttribute('href', '/tag/dragons')
  })

  it('AC-4: encode un tag qui contient un caractère réservé', async () => {
    getTags.mockResolvedValue(['c++ & rust'])

    await renderTags()

    // Sans encodage, le `&` couperait l'URL et le lien mènerait à un tag qui
    // n'existe pas.
    expect(screen.getByRole('link', { name: 'c++ & rust' })).toHaveAttribute(
      'href',
      '/tag/c%2B%2B%20%26%20rust'
    )
  })

  it('AC-6: reste rendue quand l’API des tags échoue', async () => {
    // Une erreur non rattrapée dans un Server Component fait échouer le rendu de
    // **toute la page** : la panne d'un élément décoratif emporterait le flux
    // d'articles, qui est l'essentiel.
    getTags.mockRejectedValue(new Error('réseau'))

    const { container } = await renderTags()

    expect(container.querySelector('.sidebar')).not.toBeNull()
    expect(container.querySelectorAll('a.tag-pill')).toHaveLength(0)
  })

  it('AC-6: rend une barre vide sans élément résiduel quand il n’y a aucun tag', async () => {
    getTags.mockResolvedValue([])

    const { container } = await renderTags()

    expect(container.querySelector('.tag-list')?.children).toHaveLength(0)
  })
})
