import { Inject, Injectable } from '@nestjs/common'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'
import { CommentNotFoundError } from '../../domain/comment/comment.errors'
import { COMMENT_QUERY, type CommentQueryPort } from '../../domain/comment/ports/comment-query.port'
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '../../domain/comment/ports/comment-repository.port'
import type { CommentView } from '../../domain/comment/ports/comment-view'

export interface AddCommentInput {
  /** Slug de l'article commenté, tel qu'il apparaît dans l'URL. */
  readonly slug: string
  readonly body: string
  /** Identité de l'auteur, dérivée du jeton vérifié (rule 19), jamais du corps. */
  readonly authorId: string
}

/**
 * Commenter un article (REQ-COMMENT-002,
 * `POST /api/articles/:slug/comments`).
 *
 * L'article parent est résolu **avant** l'écriture, pour deux raisons qui vont
 * dans le même sens : le commentaire référence l'article par son identifiant
 * interne — jamais par son slug, qui change au renommage — et un slug inconnu
 * doit produire un 404 (AC-6) plutôt qu'un commentaire orphelin.
 *
 * L'auteur vient de l'input, alimenté par le jeton. Le DTO du contrat ne porte
 * qu'un `body`, ce qui rend d'autant plus tentant de passer le corps de requête
 * tel quel à la persistance — et permettrait alors de commenter au nom d'un
 * autre (AC-3).
 */
@Injectable()
export class AddCommentUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(COMMENT_REPOSITORY) private readonly comments: CommentRepository,
    @Inject(COMMENT_QUERY) private readonly query: CommentQueryPort
  ) {}

  async execute(input: AddCommentInput): Promise<CommentView> {
    const article = await this.articles.findBySlug(Slug.fromPersisted(input.slug))
    if (!article) {
      throw new ArticleNotFoundError()
    }

    const created = await this.comments.create({
      body: input.body,
      articleId: article.id,
      authorId: input.authorId,
    })

    // Relecture par le port de lecture, pour la même raison que côté article :
    // l'auteur doit sortir en `Profile` complet, `following` compris, et cette
    // projection n'a qu'un seul endroit où vivre (ADR 011).
    const comment = await this.query.findById(created.id, input.authorId)
    if (!comment) {
      // État impossible : le commentaire vient d'être écrit.
      throw new CommentNotFoundError()
    }
    return comment
  }
}
