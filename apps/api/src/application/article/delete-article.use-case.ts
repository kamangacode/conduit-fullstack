import { Inject, Injectable } from '@nestjs/common'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'

export interface DeleteArticleInput {
  readonly slug: string
  /** Identité de l'appelant, dérivée du jeton vérifié (rule 19). */
  readonly userId: string
}

/**
 * Supprimer son propre article (REQ-ARTICLE-006,
 * `DELETE /api/articles/:slug`).
 *
 * Même séquence que la modification — existence (404) puis appartenance (403) —
 * et pour les mêmes raisons. Ce use-case ne renvoie rien : le contrat répond
 * 204 sans corps, contrairement au favori qui renvoie l'article.
 *
 * Les commentaires et les favoris de l'article disparaissent avec lui (AC-2).
 * Cette propriété n'est pas orchestrée ici : elle est portée par les
 * `onDelete: Cascade` du schéma, donc par une seule instruction de suppression.
 * L'orchestrer en trois appels depuis ce niveau serait plus visible et moins
 * sûr — l'échec du deuxième laisserait un état partiel qu'aucune transaction ne
 * rattraperait.
 */
@Injectable()
export class DeleteArticleUseCase {
  constructor(@Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository) {}

  async execute(input: DeleteArticleInput): Promise<void> {
    const current = await this.articles.findBySlug(Slug.fromPersisted(input.slug))
    if (!current) {
      throw new ArticleNotFoundError()
    }
    current.assertEditableBy(input.userId)

    await this.articles.delete(current.id, input.userId)
  }
}
