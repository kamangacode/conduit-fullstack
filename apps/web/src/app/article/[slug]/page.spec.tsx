import type { Article } from '@repo/shared'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api-client'
import Page from './page'

/** Tests écrits depuis les critères de REQ-WEB-012, avant l'implémentation. */

const getArticle = vi.hoisted(() => vi.fn())
const getComments = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api-client')>()),
  createApiClient: () => ({ getArticle, getComments }),
}))

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn() }) }))

// La méta et les commentaires sont des composants clients qui consomment la
// session : ils ont leurs propres specs, et les monter ici ferait échouer ces
// tests pour une raison sans rapport avec ce qu'ils vérifient.
vi.mock('../../../components/ArticleMeta', () => ({
  ArticleMeta: () => <div className="article-meta" />,
}))
vi.mock('../../../components/CommentSection', () => ({
  CommentSection: ({ slug }: { slug: string }) => <div data-testid="comments" data-slug={slug} />,
}))

const article: Article = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: '# Introduction\n\nIt takes a **Jacobian**.',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jacob', bio: null, image: null, following: false },
}

const renderPage = async (slug = 'how-to-train-your-dragon') =>
  render(await Page({ params: Promise.resolve({ slug }) }))

beforeEach(() => {
  getArticle.mockReset().mockResolvedValue(article)
  getComments.mockReset().mockResolvedValue([])
  notFound.mockClear()
})

describe('REQ-WEB-012 — page article', () => {
  it('AC-1: rend le titre, les tags et le markup du template', async () => {
    const { container } = await renderPage()

    expect(container.querySelector('.article-page .banner h1')).toHaveTextContent(
      'How to train your dragon'
    )
    expect(container.querySelector('.article-content')).not.toBeNull()
    expect(container.querySelectorAll('.tag-list li')).toHaveLength(2)
  })

  it('AC-1: répète la méta après le corps, comme le template', async () => {
    // Le lecteur arrive là en finissant l'article : c'est le moment où il
    // décide de suivre l'auteur.
    const { container } = await renderPage()

    expect(container.querySelectorAll('.article-meta')).toHaveLength(2)
    expect(container.querySelector('.article-actions')).not.toBeNull()
  })

  it('AC-2: rend le corps Markdown mis en forme', async () => {
    const { container } = await renderPage()

    expect(container.querySelector('.article-content h1')).toHaveTextContent('Introduction')
    expect(container.querySelector('.article-content strong')).toHaveTextContent('Jacobian')
  })

  it('AC-7: produit une vraie page introuvable sur un slug inconnu', async () => {
    getArticle.mockRejectedValue(new ApiError(404, {}))

    await expect(renderPage('fantome')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('AC-1: rend la section des commentaires sous l’article', async () => {
    const { getByTestId } = await renderPage()

    expect(getByTestId('comments')).toHaveAttribute('data-slug', 'how-to-train-your-dragon')
  })

  it('AC-8: une panne des commentaires n’emporte pas l’article', async () => {
    // Même arbitrage que la barre des tags : une erreur non rattrapée dans un
    // Server Component fait échouer le rendu de toute la page, et
    // l'indisponibilité des commentaires emporterait l'article, qui est
    // l'essentiel.
    getComments.mockRejectedValue(new Error('réseau'))

    const { container } = await renderPage()

    expect(container.querySelector('.article-page')).not.toBeNull()
  })

  it('AC-8: laisse remonter une panne au lieu de la déguiser en article absent', async () => {
    // « Cet article n'existe pas » affiché pendant une panne est un message
    // faux, au moment où il coûte le plus cher au lecteur.
    getArticle.mockRejectedValue(new ApiError(500, {}))

    await expect(renderPage()).rejects.toThrow()
    expect(notFound).not.toHaveBeenCalled()
  })
})
