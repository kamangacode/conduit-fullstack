import { describe, expect, it } from 'vitest'
import { StubTagQuery } from '../../../test/doubles/comment-doubles'
import { ListTagsUseCase } from '../../application/tag/list-tags.use-case'
import { TagController } from './tag.controller'

/**
 * Le contexte `tag` est le seul du dépôt à fabriquer son enveloppe directement
 * dans le controller, sans mapper dédié : il n'y a rien à convertir, seulement
 * une clé et un tableau (ADR 031).
 *
 * Ce raccourci est assumé, mais il a un effet de bord qu'une revue a relevé :
 * l'enveloppe se retrouvait sans test unitaire, là où article, comment, user et
 * profile en ont un sur leur mapper. La suite de conformité la couvre bien
 * (`tags.hurl`), mais elle demande Postgres, une API démarrée et hurl installé —
 * donc elle ne tourne pas en lane unit, et un écart de forme n'est vu que
 * beaucoup plus tard.
 */

const controllerWith = (tags: readonly string[]): TagController =>
  new TagController(new ListTagsUseCase(new StubTagQuery(tags)))

describe('REQ-TAG-002 — forme de la réponse des tags (PRD §8)', () => {
  it('AC-1: enveloppe la liste sous la clé `tags`, et rien d’autre', async () => {
    const response = await controllerWith(['reactjs', 'angularjs']).list()

    expect(Object.keys(response)).toEqual(['tags'])
    expect(response.tags).toEqual(['reactjs', 'angularjs'])
  })

  it('AC-3: rend une enveloppe conforme quand aucun tag n’est publié', () => {
    // Le contrat attend `{ tags: [] }`, jamais `[]` ni `{}` : un front qui lit
    // `body.tags.map` planterait sur les deux autres formes.
    return expect(controllerWith([]).list()).resolves.toEqual({ tags: [] })
  })

  it('AC-1: recopie le tableau au lieu de partager celui du port', async () => {
    // Sans la copie, le controller renverrait le tableau que la couche du
    // dessous vient de produire, et un appelant pourrait le muter.
    const port = new StubTagQuery(['reactjs'])
    const useCase = new ListTagsUseCase(port)
    const response = await new TagController(useCase).list()

    expect(response.tags).not.toBe(await useCase.execute())
  })
})
