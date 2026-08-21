import type { ViewerId } from '../../shared/viewer-id'
import type { CommentView } from './comment-view'

/**
 * Port de **lecture** des commentaires, symétrique de `ArticleQueryPort`.
 *
 * Les deux ports vivaient dans le **même fichier**, ce qui suffisait à faire du
 * fichier entier un consommateur du contrat HTTP : la moitié lecture importait
 * `Comment` de `@repo/shared`. Le fichier documentait lui-même la séparation
 * (ADR 011) sans en tirer la conséquence sur le découpage ; ils sont désormais
 * dans deux fichiers, tous deux dans `domain/`.
 *
 * Son jumeau d'écriture, `CommentRepository`, manipule l'entité porteuse de la
 * règle d'appartenance (R-6) ; celui-ci produit une vue qui dépend du lecteur et
 * ne porte aucun invariant.
 *
 * Il renvoie un read model possédé par le dépôt (`comment-view.ts`), et non la
 * projection du contrat. La forme du fil est produite par
 * `interface/article/comment.mapper.ts`.
 *
 * La liste n'est **ni paginée ni comptée** : le contrat ne le prévoit pas
 * (REQ-COMMENT-003 AC-1), et l'ajouter ferait dévier ce dépôt de la suite de
 * conformité qui compare les implémentations Conduit.
 */
export interface CommentQueryPort {
  listByArticle(articleId: string, viewer: ViewerId): Promise<readonly CommentView[]>

  /** Relecture d'un commentaire pour produire la réponse de création. */
  findById(id: number, viewer: ViewerId): Promise<CommentView | null>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const COMMENT_QUERY = Symbol('CommentQueryPort')
