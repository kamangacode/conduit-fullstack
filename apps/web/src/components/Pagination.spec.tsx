import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pagination } from './Pagination'

/** Tests écrits depuis les critères de REQ-WEB-010, avant l'implémentation. */

const renderPagination = (
  props: Partial<{
    articlesCount: number
    currentPage: number
    pathname: string
    search: string
  }> = {}
) => {
  const { articlesCount = 47, currentPage = 1, pathname = '/', search = '' } = props
  return render(
    <Pagination
      articlesCount={articlesCount}
      currentPage={currentPage}
      pathname={pathname}
      searchParams={new URLSearchParams(search)}
    />
  )
}

const pageLinks = (container: HTMLElement) => [...container.querySelectorAll('li.page-item')]

describe('REQ-WEB-010 — pagination rendue', () => {
  it('AC-1: rend autant de liens que le total de l’API l’exige', () => {
    // 47 articles reçus par pages de 20 : trois pages, alors que la liste
    // affichée n'en contient que 20. Compter les articles reçus n'en donnerait
    // qu'une, et les 27 suivants seraient inatteignables sans aucune erreur.
    const { container } = renderPagination({ articlesCount: 47 })

    expect(pageLinks(container)).toHaveLength(3)
    expect(pageLinks(container).map((item) => item.textContent)).toEqual(['1', '2', '3'])
  })

  it('AC-2: rend la dernière page même partiellement remplie', () => {
    const { container } = renderPagination({ articlesCount: 41 })

    expect(pageLinks(container)).toHaveLength(3)
  })

  it('AC-3: ne rend rien quand tout tient sur une page', () => {
    const { container } = renderPagination({ articlesCount: 20 })

    expect(container.querySelector('.pagination')).toBeNull()
  })

  it('AC-3: ne rend rien quand la liste est vide', () => {
    const { container } = renderPagination({ articlesCount: 0 })

    expect(container.querySelector('.pagination')).toBeNull()
  })

  it('AC-4: marque la page courante, et elle seule', () => {
    const { container } = renderPagination({ articlesCount: 47, currentPage: 2 })

    const actives = pageLinks(container).filter((item) => item.classList.contains('active'))
    expect(actives).toHaveLength(1)
    expect(actives[0]).toHaveTextContent('2')
  })

  it('AC-5: conserve le filtre courant dans chaque lien', () => {
    const { container } = renderPagination({
      articlesCount: 47,
      pathname: '/tag/dragons',
      search: 'feed=following',
    })

    const hrefs = [...container.querySelectorAll('a.page-link')].map((link) =>
      link.getAttribute('href')
    )
    expect(hrefs[0]).toBe('/tag/dragons?feed=following')
    expect(hrefs[1]).toBe('/tag/dragons?feed=following&page=2')
  })

  it('AC-1: suit le markup RealWorld de la pagination', () => {
    const { container } = renderPagination()

    expect(container.querySelector('ul.pagination')).not.toBeNull()
    expect(container.querySelector('li.page-item a.page-link')).not.toBeNull()
  })
})
