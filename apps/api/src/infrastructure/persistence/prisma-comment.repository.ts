import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Comment } from '@repo/shared'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import type { ViewerId } from '../../domain/article/ports/article-query.port'
import { CommentEntity } from '../../domain/comment/comment'
import { CommentNotFoundError } from '../../domain/comment/comment.errors'
import type {
  CommentQueryPort,
  CommentRepository,
  NewComment,
} from '../../domain/comment/ports/comment-repository.port'
import { PrismaService } from '../prisma/prisma.service'

/** Enregistrement absent lors d'un `delete`. */
const RECORD_NOT_FOUND = 'P2025'

/** Violation de clé étrangère — l'article ou l'auteur référencé n'existe plus. */
const FOREIGN_KEY_VIOLATION = 'P2003'

/** Voir `prisma-article.query.ts` : UUID valide qu'aucun compte ne peut porter. */
const NO_VIEWER = '00000000-0000-0000-0000-000000000000'

/**
 * Adapter Prisma du port d'**écriture** des commentaires.
 *
 * `delete` filtre par couple `(id, authorId)` dans la requête elle-même
 * (rule 19) : un commentaire qui n'appartient pas à l'appelant ne correspond
 * simplement à rien. La garde du domaine (`assertDeletableBy`) reste en amont
 * pour nommer l'erreur métier ; celle-ci ferme la fenêtre de course.
 */
@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<CommentEntity | null> {
    const row = await this.prisma.comment.findUnique({ where: { id } })
    return row ? toEntity(row) : null
  }

  async create(comment: NewComment): Promise<CommentEntity> {
    try {
      const row = await this.prisma.comment.create({
        data: {
          body: comment.body,
          articleId: comment.articleId,
          authorId: comment.authorId,
        },
      })
      return toEntity(row)
    } catch (error) {
      throw translateMissingReference(error)
    }
  }

  async delete(id: number, authorId: string): Promise<void> {
    try {
      await this.prisma.comment.delete({ where: { id, authorId } })
    } catch (error) {
      throw isPrismaCode(error, RECORD_NOT_FOUND) ? new CommentNotFoundError() : error
    }
  }
}

/**
 * Adapter Prisma du port de **lecture** des commentaires.
 *
 * Chaque commentaire porte son auteur en `Profile` complet, `following` compris
 * — donc une relation au lecteur, résolue en base plutôt que par une requête par
 * commentaire (ADR 011).
 *
 * La liste n'est ni paginée ni comptée : le contrat ne le prévoit pas
 * (REQ-COMMENT-003 AC-1).
 */
@Injectable()
export class PrismaCommentQuery implements CommentQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByArticle(articleId: string, viewer: ViewerId): Promise<readonly Comment[]> {
    const rows = await this.prisma.comment.findMany({
      where: { articleId },
      // Le contrat n'impose aucun ordre ; le chronologique est stable et
      // prévisible, donc testable.
      orderBy: { createdAt: 'asc' },
      include: commentInclude(viewer),
    })
    return rows.map(toComment)
  }

  async findById(id: number, viewer: ViewerId): Promise<Comment | null> {
    const row = await this.prisma.comment.findUnique({
      where: { id },
      include: commentInclude(viewer),
    })
    return row ? toComment(row) : null
  }
}

function commentInclude(viewer: ViewerId) {
  return {
    author: {
      include: {
        followers: { where: { followerId: viewer ?? NO_VIEWER }, select: { followerId: true } },
      },
    },
  } satisfies Prisma.CommentInclude
}

type CommentRow = Prisma.CommentGetPayload<{ include: ReturnType<typeof commentInclude> }>

function toEntity(row: {
  id: number
  body: string
  articleId: string
  authorId: string
  createdAt: Date
  updatedAt: Date
}): CommentEntity {
  return CommentEntity.fromProps({
    id: row.id,
    body: row.body,
    articleId: row.articleId,
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

/**
 * Projection §8 « Single Comment », écrite champ par champ : un étalement
 * emporterait `articleId` et `authorId`, des identifiants internes qui ne
 * sortent pas de l'API.
 */
function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    body: row.body,
    author: {
      username: row.author.username,
      bio: row.author.bio,
      image: row.author.image,
      following: row.author.followers.length > 0,
    },
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

/**
 * L'article commenté a disparu entre sa résolution par le use-case et
 * l'écriture. `ArticleNotFoundError` plutôt qu'une erreur de commentaire : c'est
 * bien le parent qui manque, et le client doit comprendre que c'est l'article
 * qu'il visait qui n'est plus là.
 */
function translateMissingReference(error: unknown): unknown {
  return isPrismaCode(error, FOREIGN_KEY_VIOLATION) ? new ArticleNotFoundError() : error
}
