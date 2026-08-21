import { describe, expect, it } from 'vitest'
import { StubTagQuery } from '../../../test/doubles/comment-doubles'
import { ListTagsUseCase } from './list-tags.use-case'

/**
 * L'enveloppe `{ tags: [...] }` n'est plus fabriquée par le use-case depuis
 * l'ADR 031 : elle l'est par `interface/tag/tag.controller.ts`, sans mapper
 * dédié — il n'y a rien à convertir, seulement une clé et un tableau. Sa forme
 * est couverte par la suite de conformité (`tags.hurl`) et par le harnais de
 * contrat de l'ADR 026, qui l'assertent sur la réponse réelle.
 *
 * Ce qui se teste ici est ce que le use-case décide encore, et c'est peu : il
 * transmet sans transformer.
 */

describe('REQ-TAG-002 — lister les tags disponibles', () => {
  it('AC-1: rend la liste telle que le port la produit', async () => {
    const useCase = new ListTagsUseCase(new StubTagQuery(['reactjs', 'angularjs']))

    const response = await useCase.execute()

    expect(response).toEqual(['reactjs', 'angularjs'])
  })

  it('AC-3: rend une liste vide plutôt qu’une erreur quand rien n’est publié', async () => {
    const useCase = new ListTagsUseCase(new StubTagQuery([]))

    await expect(useCase.execute()).resolves.toEqual([])
  })

  it('AC-1: ne renormalise pas les tags rendus par le port', async () => {
    // La normalisation est faite à l'écriture, une seule fois (REQ-TAG-001).
    // La refaire ici en créerait une seconde, et deux normalisations divergent :
    // le tag affiché dans la sidebar ne correspondrait plus à celui stocké, donc
    // le filtre associé ne ramènerait aucun article.
    const useCase = new ListTagsUseCase(new StubTagQuery(['ReactJS', 'angular js']))

    const response = await useCase.execute()

    expect(response).toEqual(['ReactJS', 'angular js'])
  })

  it('AC-2: n’interroge le port qu’une fois par appel', async () => {
    const query = new StubTagQuery()
    const useCase = new ListTagsUseCase(query)

    await useCase.execute()

    expect(query.calls).toBe(1)
  })
})
