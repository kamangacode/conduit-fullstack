import { describe, expect, it } from 'vitest'
import {
  commentSchema,
  commentsResponseSchema,
  createCommentDtoSchema,
  createCommentRequestSchema,
} from './comment'

/** Exemple verbatim du PRD §8 (« Single Comment »). */
const commentFromSpec = {
  id: 1,
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:22:56.637Z',
  body: 'It takes a Jacobian',
  author: {
    username: 'jake',
    bio: 'I work at statefarm',
    image: 'https://i.stack.imgur.com/xHWG8.jpg',
    following: false,
  },
}

describe('commentSchema', () => {
  it('accepte le commentaire verbatim de la spec', () => {
    expect(commentSchema.parse(commentFromSpec)).toEqual(commentFromSpec)
  })

  it('refuse un UUID comme id : le contrat officiel déclare type integer', () => {
    const withUuid = { ...commentFromSpec, id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }

    expect(commentSchema.safeParse(withUuid).success).toBe(false)
  })

  it('refuse un id entier transporté en chaîne', () => {
    expect(commentSchema.safeParse({ ...commentFromSpec, id: '1' }).success).toBe(false)
  })

  it('refuse un id décimal', () => {
    expect(commentSchema.safeParse({ ...commentFromSpec, id: 1.5 }).success).toBe(false)
  })

  it("porte un Profile complet en auteur, comme l'article", () => {
    expect(
      commentSchema.safeParse({ ...commentFromSpec, author: { username: 'jake' } }).success
    ).toBe(false)
  })
})

describe('commentsResponseSchema', () => {
  it("valide l'enveloppe { comments: [...] } de la spec §8", () => {
    expect(commentsResponseSchema.parse({ comments: [commentFromSpec] })).toEqual({
      comments: [commentFromSpec],
    })
  })

  it('accepte un article sans commentaire', () => {
    expect(commentsResponseSchema.parse({ comments: [] })).toEqual({ comments: [] })
  })

  it("n'expose pas de compteur : la spec ne pagine pas les commentaires", () => {
    const parsed = commentsResponseSchema.parse({ comments: [] })

    expect(Object.keys(parsed)).toEqual(['comments'])
  })
})

describe('createCommentDtoSchema', () => {
  it("accepte l'ajout de la spec §7.4", () => {
    expect(createCommentDtoSchema.parse({ body: 'His name was my name too.' })).toEqual({
      body: 'His name was my name too.',
    })
  })

  it('refuse un commentaire vide après normalisation', () => {
    expect(createCommentDtoSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it("ignore un author envoyé par le client — l'auteur vient du JWT, jamais du corps", () => {
    const parsed = createCommentDtoSchema.parse({ body: 'coucou', author: 'quelquun-dautre' })

    expect(parsed).not.toHaveProperty('author')
  })
})

describe('createCommentRequestSchema', () => {
  it("valide l'enveloppe { comment: … } du corps de requête", () => {
    expect(
      createCommentRequestSchema.parse({ comment: { body: 'His name was my name too.' } })
    ).toEqual({ comment: { body: 'His name was my name too.' } })
  })
})
