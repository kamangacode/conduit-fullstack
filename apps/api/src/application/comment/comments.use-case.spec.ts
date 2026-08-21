import { describe, expect, it } from 'vitest'
import {
  AUTHOR_ID,
  anArticleProps,
  InMemoryArticleRepository,
  OTHER_USER_ID,
} from '../../../test/doubles/article-doubles'
import {
  aCommentProps,
  aCommentResponse,
  InMemoryCommentRepository,
  RecordingCommentQuery,
} from '../../../test/doubles/comment-doubles'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import { CommentNotFoundError, CommentNotOwnedError } from '../../domain/comment/comment.errors'
import { AddCommentUseCase } from './add-comment.use-case'
import { DeleteCommentUseCase } from './delete-comment.use-case'
import { ListCommentsUseCase } from './list-comments.use-case'

const article = anArticleProps()
/** Jamais posé dans le dépôt : il ne sert qu'à porter un identifiant d'article distinct. */
const otherArticle = anArticleProps()

describe('REQ-COMMENT-002 — commenter un article', () => {
  const build = () => {
    const articles = new InMemoryArticleRepository([article])
    const comments = new InMemoryCommentRepository()
    const query = new RecordingCommentQuery()
    return { useCase: new AddCommentUseCase(articles, comments, query), comments, query }
  }

  it('AC-1: persiste le commentaire et le renvoie au format du contrat', async () => {
    const { useCase, comments } = build()

    const comment = await useCase.execute({
      slug: article.slug.value,
      body: 'His name was my name too.',
      authorId: OTHER_USER_ID,
    })

    expect(comments.size).toBe(1)
    expect(comment.author).toBeDefined()
  })

  it('AC-1: attribue le commentaire au porteur du jeton', async () => {
    const { useCase, comments } = build()

    await useCase.execute({
      slug: article.slug.value,
      body: 'His name was my name too.',
      authorId: OTHER_USER_ID,
    })

    expect(comments.all()[0]?.authorId).toBe(OTHER_USER_ID)
  })

  it('AC-1: rattache le commentaire à l’article par son identifiant interne', async () => {
    // Rattacher par slug casserait au premier renommage de l'article : les
    // commentaires deviendraient orphelins alors que rien n'a été supprimé.
    const { useCase, comments } = build()

    await useCase.execute({
      slug: article.slug.value,
      body: 'His name was my name too.',
      authorId: OTHER_USER_ID,
    })

    expect(comments.all()[0]?.articleId).toBe(article.id)
  })

  it('AC-2: produit un identifiant entier', async () => {
    const { useCase, comments } = build()

    await useCase.execute({ slug: article.slug.value, body: 'x', authorId: OTHER_USER_ID })

    const id = comments.all()[0]?.id
    expect(Number.isInteger(id)).toBe(true)
  })

  it('AC-6: refuse un slug inconnu sans rien écrire', async () => {
    const { useCase, comments } = build()

    await expect(
      useCase.execute({ slug: 'jamais-ecrit', body: 'x', authorId: OTHER_USER_ID })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)

    // Écrire avant de résoudre l'article laisserait un commentaire orphelin.
    expect(comments.size).toBe(0)
  })

  it('AC-1: relit le commentaire créé en transmettant le lecteur', async () => {
    const { useCase, query } = build()

    await useCase.execute({ slug: article.slug.value, body: 'x', authorId: OTHER_USER_ID })

    expect(query.findCalls.at(-1)?.viewer).toBe(OTHER_USER_ID)
  })
})

describe('REQ-COMMENT-003 — lister les commentaires d’un article', () => {
  const build = (comments: ReturnType<typeof aCommentResponse>[] = []) => {
    const articles = new InMemoryArticleRepository([article])
    const query = new RecordingCommentQuery(comments)
    return { useCase: new ListCommentsUseCase(articles, query), query }
  }

  it('AC-1: rend la liste telle que le port la produit, sans la recomposer', async () => {
    const comment = aCommentResponse()
    const { useCase } = build([comment])

    const response = await useCase.execute({ slug: article.slug.value, viewer: null })

    // Le use-case oriente et autorise, il ne transforme pas. L'absence de
    // `commentsCount` et de pagination dans l'enveloppe est vérifiée là où
    // l'enveloppe est produite : `interface/article/comment.mapper.spec.ts`.
    expect(response).toEqual([comment])
  })

  it('AC-2: renvoie une liste vide sur un article sans commentaire', async () => {
    const { useCase } = build([])

    const response = await useCase.execute({ slug: article.slug.value, viewer: null })

    // L'enveloppe `{ comments: [...] }` est vérifiée là où elle est désormais
    // produite : `interface/article/comment.mapper.spec.ts`.
    expect(response).toEqual([])
  })

  it('AC-4: distingue l’article absent de la conversation vide', async () => {
    const { useCase } = build([])

    await expect(useCase.execute({ slug: 'jamais-ecrit', viewer: null })).rejects.toBeInstanceOf(
      ArticleNotFoundError
    )
  })

  it('AC-3: transmet le lecteur pour que following soit calculé par commentaire', async () => {
    const { useCase, query } = build([aCommentResponse()])

    await useCase.execute({ slug: article.slug.value, viewer: AUTHOR_ID })

    expect(query.listCalls.at(-1)?.viewer).toBe(AUTHOR_ID)
    expect(query.listCalls.at(-1)?.articleId).toBe(article.id)
  })
})

describe('REQ-COMMENT-004 — supprimer son propre commentaire', () => {
  const mine = aCommentProps({ articleId: article.id, authorId: AUTHOR_ID })
  const elsewhere = aCommentProps({ articleId: otherArticle.id, authorId: AUTHOR_ID })
  const notMine = aCommentProps({ articleId: article.id, authorId: OTHER_USER_ID })

  const build = () => {
    const articles = new InMemoryArticleRepository([article])
    const comments = new InMemoryCommentRepository([mine, elsewhere, notMine])
    return { useCase: new DeleteCommentUseCase(articles, comments), comments }
  }

  it('AC-1: retire le commentaire de son auteur', async () => {
    const { useCase, comments } = build()

    await useCase.execute({ slug: article.slug.value, commentId: mine.id, userId: AUTHOR_ID })

    expect(comments.snapshot(mine.id)).toBeUndefined()
  })

  it('AC-2: refuse la suppression du commentaire d’un autre', async () => {
    const { useCase, comments } = build()

    await expect(
      useCase.execute({ slug: article.slug.value, commentId: notMine.id, userId: AUTHOR_ID })
    ).rejects.toBeInstanceOf(CommentNotOwnedError)

    expect(comments.snapshot(notMine.id)).toBeDefined()
  })

  it('AC-3: refuse un identifiant de commentaire inexistant', async () => {
    const { useCase } = build()

    await expect(
      useCase.execute({ slug: article.slug.value, commentId: 999_999, userId: AUTHOR_ID })
    ).rejects.toBeInstanceOf(CommentNotFoundError)
  })

  it('AC-4: refuse un commentaire rattaché à un autre article que celui du chemin', async () => {
    // La route porte deux identifiants ; n'utiliser que le second parce qu'il
    // suffit à retrouver la ressource est le motif exact d'un IDOR.
    const { useCase, comments } = build()

    await expect(
      useCase.execute({ slug: article.slug.value, commentId: elsewhere.id, userId: AUTHOR_ID })
    ).rejects.toBeInstanceOf(CommentNotFoundError)

    expect(comments.snapshot(elsewhere.id)).toBeDefined()
  })

  it('AC-4: ne distingue pas « inexistant » de « rattaché ailleurs »', async () => {
    // Les identifiants sont séquentiels (ADR 004) : deux erreurs différentes
    // donneraient à qui les énumère un oracle d'existence.
    const { useCase } = build()

    const absent = await useCase
      .execute({ slug: article.slug.value, commentId: 999_999, userId: AUTHOR_ID })
      .catch((error: unknown) => error)
    const misplaced = await useCase
      .execute({ slug: article.slug.value, commentId: elsewhere.id, userId: AUTHOR_ID })
      .catch((error: unknown) => error)

    expect((absent as Error).constructor).toBe((misplaced as Error).constructor)
    expect((absent as Error).message).toBe((misplaced as Error).message)
  })
})
