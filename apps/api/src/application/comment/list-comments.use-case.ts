import { Inject, Injectable } from '@nestjs/common'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'
import type { ViewerId } from '../shared/viewer-id'
import { COMMENT_QUERY, type CommentQueryPort } from './ports/comment-query.port'
import type { CommentView } from './ports/comment-view'

export interface ListCommentsInput {
  readonly slug: string
  /** Lecteur, ou `null` si anonyme : la conversation est publique (R-5). */
  readonly viewer: ViewerId
}

/**
 * Lister les commentaires d'un article (REQ-COMMENT-003,
 * `GET /api/articles/:slug/comments`).
 *
 * L'article est résolu d'abord, et c'est ce qui permet de distinguer deux
 * absences qu'un même code confondrait : l'article n'existe pas (404, AC-4)
 * contre l'article existe et personne n'a commenté (200 et liste vide, AC-2).
 * Se tromper ici casse la page article du front, qui affiche l'article puis
 * échoue à charger sa conversation.
 *
 * L'enveloppe ne porte **ni compteur ni pagination** : le contrat ne les prévoit
 * pas, et les ajouter ferait dévier ce dépôt de la suite de conformité qui
 * compare les implémentations Conduit.
 */
@Injectable()
export class ListCommentsUseCase {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(COMMENT_QUERY) private readonly query: CommentQueryPort
  ) {}

  async execute(input: ListCommentsInput): Promise<readonly CommentView[]> {
    const article = await this.articles.findBySlug(Slug.fromPersisted(input.slug))
    if (!article) {
      throw new ArticleNotFoundError()
    }

    const comments = await this.query.listByArticle(article.id, input.viewer)
    return comments
  }
}
