import type { Comment } from '@repo/shared'
import type { ViewerId } from '../../shared/viewer-id'

/**
 * Port de **lecture** des commentaires, symétrique de `ArticleQueryPort`.
 *
 * Il vit dans `application/` pour la même raison que lui (ADR 031) : il sert un
 * affichage, il ne protège aucun invariant. Son jumeau d'écriture,
 * `CommentRepository`, reste dans `domain/` parce qu'il manipule une entité
 * porteuse de la règle d'appartenance (R-6).
 *
 * Les deux vivaient dans le **même fichier** de `domain/comment/ports/`, ce qui
 * suffisait à faire du fichier entier un consommateur du contrat HTTP : la
 * moitié lecture importait `Comment` de `@repo/shared`. Le fichier documentait
 * lui-même la séparation ; seul l'emplacement du second était faux.
 *
 * Il renvoie encore les projections du contrat partagé. C'est un état
 * **transitoire** : le déplacement a été fait ici parce que `ViewerId` est
 * descendu en `application/shared/` avec le port d'article, et qu'un port de
 * `domain/` ne peut pas importer `application/`. Le passage au read model
 * (`CommentView`) et le mapper associé sont le lot suivant.
 *
 * La liste n'est **ni paginée ni comptée** : le contrat ne le prévoit pas
 * (REQ-COMMENT-003 AC-1), et l'ajouter ferait dévier ce dépôt de la suite de
 * conformité qui compare les implémentations Conduit.
 */
export interface CommentQueryPort {
  listByArticle(articleId: string, viewer: ViewerId): Promise<readonly Comment[]>

  /** Relecture d'un commentaire pour produire la réponse de création. */
  findById(id: number, viewer: ViewerId): Promise<Comment | null>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const COMMENT_QUERY = Symbol('CommentQueryPort')
