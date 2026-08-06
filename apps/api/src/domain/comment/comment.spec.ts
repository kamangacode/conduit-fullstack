import { describe, expect, it } from 'vitest'
import { CommentEntity, type CommentProps } from './comment'
import { CommentNotOwnedError } from './comment.errors'

/** Tests unitaires du domaine : zéro mock, zéro I/O (rule 16). */

const AUTHOR_ID = 'c0ffee00-0000-4000-8000-000000000001'
const OTHER_USER_ID = 'c0ffee00-0000-4000-8000-000000000002'
const ARTICLE_ID = 'a1710000-0000-4000-8000-000000000001'
const OTHER_ARTICLE_ID = 'a1710000-0000-4000-8000-000000000002'

const baseProps: CommentProps = {
  id: 1,
  body: 'His name was my name too.',
  articleId: ARTICLE_ID,
  authorId: AUTHOR_ID,
  createdAt: new Date('2016-02-18T03:22:56.637Z'),
  updatedAt: new Date('2016-02-18T03:22:56.637Z'),
}

const aComment = (overrides: Partial<CommentProps> = {}): CommentEntity =>
  CommentEntity.fromProps({ ...baseProps, ...overrides })

describe('REQ-COMMENT-004 — suppression de son propre commentaire', () => {
  it('AC-1: laisse passer l’auteur du commentaire', () => {
    expect(() => aComment().assertDeletableBy(AUTHOR_ID)).not.toThrow()
  })

  it('AC-2: refuse la suppression par un autre utilisateur', () => {
    expect(() => aComment().assertDeletableBy(OTHER_USER_ID)).toThrow(CommentNotOwnedError)
  })

  it('AC-2: refuse aussi l’auteur de l’article, qui n’a aucun droit de modération', () => {
    // Le contrat RealWorld ne prévoit pas de modération : R-6 ne parle que de
    // l'auteur du commentaire. Étendre le droit au propriétaire du fil serait
    // une règle inventée, absente de la suite de conformité.
    const articleOwner = OTHER_USER_ID

    expect(() => aComment().assertDeletableBy(articleOwner)).toThrow(CommentNotOwnedError)
  })

  it('AC-2: signale l’interdiction par une erreur métier, sans code HTTP', () => {
    try {
      aComment().assertDeletableBy(OTHER_USER_ID)
      expect.unreachable('assertDeletableBy aurait dû lever')
    } catch (error) {
      expect(error).toBeInstanceOf(CommentNotOwnedError)
      expect((error as CommentNotOwnedError).errorCode).toBe('forbidden')
    }
  })

  it('AC-4: reconnaît le commentaire rattaché à l’article du chemin', () => {
    expect(aComment().belongsToArticle(ARTICLE_ID)).toBe(true)
  })

  it('AC-4: rejette un commentaire rattaché à un autre article', () => {
    // La route porte deux identifiants ; ignorer le premier parce que le second
    // suffit à retrouver la ressource est le motif exact d'un IDOR.
    expect(aComment().belongsToArticle(OTHER_ARTICLE_ID)).toBe(false)
  })
})

describe('REQ-COMMENT-002 — forme du commentaire créé', () => {
  it('AC-2: porte un identifiant entier, conformément au contrat', () => {
    // Le commentaire est la seule entité dont l'identifiant traverse l'API
    // (DELETE …/comments/:id), d'où l'alignement de la persistance sur le
    // contrat plutôt que l'inverse (ADR 004).
    const comment = aComment()

    expect(Number.isInteger(comment.id)).toBe(true)
    expect(comment.id).toBeGreaterThan(0)
  })

  it('AC-1: référence son auteur et son article par identifiant, sans les dupliquer', () => {
    const comment = aComment()

    expect(comment.authorId).toBe(AUTHOR_ID)
    expect(comment.articleId).toBe(ARTICLE_ID)
  })

  it('AC-1: n’expose aucun moyen de modifier le corps après création', () => {
    // Le contrat n'a pas d'endpoint d'édition de commentaire. Une méthode de
    // modification serait une capacité que rien n'appelle, et qu'un adapter
    // finirait par câbler « puisqu'elle existe ».
    expect('withChanges' in aComment()).toBe(false)
  })
})
