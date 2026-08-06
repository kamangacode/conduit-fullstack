import { Inject, Injectable } from '@nestjs/common'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'
import { CommentNotFoundError } from '../../domain/comment/comment.errors'
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '../../domain/comment/ports/comment-repository.port'

export interface DeleteCommentInput {
  /** Slug de l'article, tel qu'il apparaît dans l'URL. */
  readonly slug: string
  /** Identifiant entier du commentaire (ADR 004). */
  readonly commentId: number
  /** Identité de l'appelant, dérivée du jeton vérifié (rule 19). */
  readonly userId: string
}

/**
 * Supprimer son propre commentaire (REQ-COMMENT-004,
 * `DELETE /api/articles/:slug/comments/:id`).
 *
 * Quatre contrôles, dans cet ordre, et chacun ferme une porte différente :
 *
 * 1. **L'article du chemin existe-t-il ?** Sinon 404.
 * 2. **Le commentaire existe-t-il ?** Sinon 404 (AC-3).
 * 3. **Est-il rattaché à cet article ?** Sinon 404 (AC-4). C'est le contrôle
 *    qu'on est tenté d'omettre, puisque l'identifiant suffit à retrouver le
 *    commentaire — et c'est exactement le motif d'un IDOR : un chemin qui
 *    affirme une relation que le code ne vérifie pas.
 * 4. **En est-il l'auteur ?** Sinon 403 (AC-2), jamais 404 : les commentaires
 *    sont publiquement lisibles, leur existence n'est pas protégée (ADR 008).
 *
 * Les deux premiers 404 et le troisième portent la **même** erreur, sans rien
 * distinguer. Les identifiants de commentaires étant séquentiels (ADR 004),
 * différencier « n'existe pas » de « existe ailleurs » donnerait à qui les
 * énumère un oracle d'existence.
 */
@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(COMMENT_REPOSITORY) private readonly comments: CommentRepository
  ) {}

  async execute(input: DeleteCommentInput): Promise<void> {
    const article = await this.articles.findBySlug(Slug.fromPersisted(input.slug))
    if (!article) {
      throw new ArticleNotFoundError()
    }

    const comment = await this.comments.findById(input.commentId)
    if (!comment?.belongsToArticle(article.id)) {
      throw new CommentNotFoundError()
    }
    comment.assertDeletableBy(input.userId)

    await this.comments.delete(comment.id, input.userId)
  }
}
