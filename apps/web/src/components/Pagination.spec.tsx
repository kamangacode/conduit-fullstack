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

const pageItems = (container: HTMLElement) => [...container.querySelectorAll('li.page-item')]

/** Le formulaire d'un contrôle, tel que le navigateur le soumettrait. */
const controlFor = (container: HTMLElement, page: string) => {
  const button = [...container.querySelectorAll('button.page-link')].find(
    (candidate) => candidate.textContent === page
  )
  return { button, form: button?.closest('form') }
}

describe('REQ-WEB-010 — pagination rendue', () => {
  it('AC-1: rend autant de contrôles que le total de l’API l’exige', () => {
    // 47 articles reçus par pages de dix : cinq pages, alors que la liste
    // affichée n'en contient que dix. Compter les articles reçus n'en donnerait
    // qu'une, et les 37 suivants seraient inatteignables sans aucune erreur.
    const { container } = renderPagination({ articlesCount: 47 })

    expect(pageItems(container)).toHaveLength(5)
    expect(pageItems(container).map((item) => item.textContent)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('AC-2: rend la dernière page même partiellement remplie', () => {
    // 41 articles sur des pages de dix font **cinq** pages, pas quatre.
    const { container } = renderPagination({ articlesCount: 41 })

    expect(pageItems(container)).toHaveLength(5)
  })

  it('AC-3: ne rend rien quand tout tient sur une page', () => {
    const { container } = renderPagination({ articlesCount: 10 })

    expect(container.querySelector('.pagination')).toBeNull()
  })

  it('AC-3: ne rend rien quand la liste est vide', () => {
    const { container } = renderPagination({ articlesCount: 0 })

    expect(container.querySelector('.pagination')).toBeNull()
  })

  it('AC-4: marque la page courante, et elle seule', () => {
    const { container } = renderPagination({ articlesCount: 47, currentPage: 2 })

    const actives = pageItems(container).filter((item) => item.classList.contains('active'))
    expect(actives).toHaveLength(1)
    expect(actives[0]).toHaveTextContent('2')
  })

  it('AC-9: marque la page courante quand elle vient directement de l’URL', () => {
    // `/tag/dragons?page=2` ouverte de but en blanc : rien n'a été cliqué, la
    // position vient de l'adresse seule.
    const { container } = renderPagination({
      articlesCount: 15,
      currentPage: 2,
      pathname: '/tag/dragons',
    })

    const active = container.querySelector('li.page-item.active')
    expect(active).toHaveTextContent('2')
    expect(active?.querySelector('button')).not.toBeNull()
  })

  it('AC-7: rend un bouton par page, et aucun lien de pagination', () => {
    // Le contrat vise `.pagination button` et `.page-item:has(button…)` :
    // `SELECTORS.md` décrit `.page-item` comme un « page button wrapper », et un
    // `<a>` ne satisfait aucun des deux ([ADR 023]).
    const { container } = renderPagination({ articlesCount: 47 })

    expect(container.querySelectorAll('.pagination button')).toHaveLength(5)
    for (const item of pageItems(container)) {
      expect(item.querySelector('button.page-link')).not.toBeNull()
    }
    expect(container.querySelector('.pagination a')).toBeNull()
  })

  it('AC-8: vise le chemin courant et le numéro demandé', () => {
    const { container } = renderPagination({
      articlesCount: 15,
      pathname: '/tag/dragons',
    })

    const { button, form } = controlFor(container, '2')
    expect(form).toHaveAttribute('method', 'get')
    expect(form).toHaveAttribute('action', '/tag/dragons')
    expect(button).toHaveAttribute('name', 'page')
    expect(button).toHaveAttribute('value', '2')
  })

  it('AC-5: reporte le filtre courant en champ caché, avant le bouton', () => {
    // L'ordre du DOM est l'ordre de soumission : c'est lui qui produit
    // `/?feed=following&page=2` plutôt que l'inverse.
    const { container } = renderPagination({
      articlesCount: 15,
      search: 'feed=following',
    })

    const { button, form } = controlFor(container, '2')
    const hidden = form?.querySelector('input[type="hidden"]')
    expect(hidden).toHaveAttribute('name', 'feed')
    expect(hidden).toHaveAttribute('value', 'following')
    expect(form && new FormData(form).get('feed')).toBe('following')

    // L'assertion qui manquait : `hidden` et `button` peuvent tous deux être
    // présents sans être dans le bon ordre. `compareDocumentPosition` est le
    // test direct de « avant » que `FormData` (qui suit l'ordre du DOM, donc
    // masque une inversion) ne peut pas fournir.
    expect(hidden?.compareDocumentPosition(button as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('AC-6: ne nomme pas le contrôle de la première page, pour une URL canonique', () => {
    // Un contrôle sans `name` n'est pas soumis : la cible reste `/` et non
    // `/?page=1`, qui désignerait la même ressource sous une seconde adresse.
    const { container } = renderPagination({ articlesCount: 47 })

    const { button } = controlFor(container, '1')
    expect(button).not.toHaveAttribute('name')
  })

  it('AC-1: suit le markup RealWorld de la pagination', () => {
    const { container } = renderPagination()

    expect(container.querySelector('ul.pagination')).not.toBeNull()
    expect(container.querySelector('li.page-item form button.page-link')).not.toBeNull()
  })
})
