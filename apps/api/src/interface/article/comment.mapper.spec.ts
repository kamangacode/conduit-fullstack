import { describe, expect, it } from 'vitest'
import type { CommentView } from '../../application/comment/ports/comment-view'
import { toComment, toCommentsResponse } from './comment.mapper'

/**
 * Pendant de `article.mapper.spec.ts` : la forme §8 des commentaires était
 * produite par le type même du port de lecture, elle est produite ici depuis
 * l'ADR 031.
 */

const aView = (overrides: Partial<CommentView> = {}): CommentView => ({
  id: 1,
  body: 'His name was my name too.',
  createdAt: new Date('2016-02-18T03:22:56.637Z'),
  updatedAt: new Date('2016-02-18T03:48:35.824Z'),
  author: { username: 'jake', bio: null, image: null, following: false },
  ...overrides,
})

describe('REQ-COMMENT-003 — forme du commentaire (PRD §8)', () => {
  it('AC-1: sérialise les horodatages en ISO 8601', () => {
    const comment = toComment(aView())

    expect(comment.createdAt).toBe('2016-02-18T03:22:56.637Z')
    expect(comment.updatedAt).toBe('2016-02-18T03:48:35.824Z')
  })

  it('AC-1: produit exactement les clés du contrat, sans identifiant interne', () => {
    // `articleId` et `authorId` sont des colonnes de la table. Le read model ne
    // les déclare pas, donc ils ne peuvent pas arriver jusqu'ici — mais la liste
    // des clés est ce qui le rend visible en revue.
    expect(Object.keys(toComment(aView())).sort()).toEqual([
      'author',
      'body',
      'createdAt',
      'id',
      'updatedAt',
    ])
  })

  it('AC-1: l’auteur porte le `following` relatif au lecteur (R-5)', () => {
    const followed = toComment(
      aView({ author: { username: 'jake', bio: null, image: null, following: true } })
    )

    expect(followed.author.following).toBe(true)
  })

  it('AC-1: une conversation vide produit une enveloppe conforme, pas une réponse vide', () => {
    // Le contrat attend `{ comments: [] }`, jamais `[]` ni `{}`. C'est
    // l'assertion que le use-case portait avant de cesser de fabriquer
    // l'enveloppe.
    expect(toCommentsResponse([])).toEqual({ comments: [] })
  })

  it('AC-1: la liste n’est ni paginée ni comptée', () => {
    // L'absence de `commentsCount` est une décision (REQ-COMMENT-003 AC-1) :
    // l'ajouter ferait dévier ce dépôt de la suite de conformité officielle.
    const response = toCommentsResponse([aView(), aView({ id: 2 })])

    expect(Object.keys(response)).toEqual(['comments'])
    expect(response.comments).toHaveLength(2)
  })
})
