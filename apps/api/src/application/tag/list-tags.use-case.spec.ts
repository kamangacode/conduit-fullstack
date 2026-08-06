import { describe, expect, it } from 'vitest'
import { StubTagQuery } from '../../../test/doubles/comment-doubles'
import { ListTagsUseCase } from './list-tags.use-case'

describe('REQ-TAG-002 — lister les tags disponibles', () => {
  it('AC-1: renvoie l’enveloppe { tags: [...] } du contrat', async () => {
    const useCase = new ListTagsUseCase(new StubTagQuery(['reactjs', 'angularjs']))

    const response = await useCase.execute()

    expect(response).toEqual({ tags: ['reactjs', 'angularjs'] })
  })

  it('AC-3: renvoie une liste vide plutôt qu’une erreur quand rien n’est publié', async () => {
    const useCase = new ListTagsUseCase(new StubTagQuery([]))

    await expect(useCase.execute()).resolves.toEqual({ tags: [] })
  })

  it('AC-1: ne renormalise pas les tags rendus par le port', async () => {
    // La normalisation est faite à l'écriture, une seule fois (REQ-TAG-001).
    // La refaire ici en créerait une seconde, et deux normalisations divergent :
    // le tag affiché dans la sidebar ne correspondrait plus à celui stocké, donc
    // le filtre associé ne ramènerait aucun article.
    const useCase = new ListTagsUseCase(new StubTagQuery(['ReactJS', 'angular js']))

    const response = await useCase.execute()

    expect(response.tags).toEqual(['ReactJS', 'angular js'])
  })

  it('AC-2: n’interroge le port qu’une fois par appel', async () => {
    const query = new StubTagQuery()
    const useCase = new ListTagsUseCase(query)

    await useCase.execute()

    expect(query.calls).toBe(1)
  })
})
