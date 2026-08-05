import type { Comment } from '@repo/shared'
import type { ViewerId } from '../../article/ports/article-query.port'
import type { CommentEntity } from '../comment'

/**
 * Données nécessaires pour publier un commentaire. Ni `id` ni horodatages :
 * produits par la persistance.
 *
 * L'`authorId` vient du jeton vérifié, jamais du corps de la requête (rule 19,
 * server-side authority ; REQ-COMMENT-002 AC-3). Le DTO du contrat ne porte
 * qu'un `body`, ce qui rend d'autant plus tentant de passer le corps de requête
 * tel quel à la persistance — et permettrait alors de commenter au nom d'un
 * autre.
 */
export interface NewComment {
  readonly body: string
  readonly articleId: string
  readonly authorId: string
}

/**
 * Port d'**écriture** des commentaires (rule 12).
 *
 * Aucune méthode de mise à jour : le contrat RealWorld n'expose pas d'édition de
 * commentaire, et le port ne propose pas ce que l'API ne fait pas.
 */
export interface CommentRepository {
  /** `null` si l'identifiant ne désigne rien — le 404 est décidé par le use-case. */
  findById(id: number): Promise<CommentEntity | null>

  create(comment: NewComment): Promise<CommentEntity>

  /**
   * Supprime le commentaire de cet auteur.
   *
   * L'`authorId` est un **paramètre de la requête** et non un contrôle
   * applicatif préalable : le filtrage par propriétaire se fait dans le `WHERE`
   * (rule 19, anti-IDOR), sans fenêtre entre la lecture et l'écriture.
   *
   * @throws CommentNotFoundError si aucun commentaire ne correspond au couple.
   */
  delete(id: number, authorId: string): Promise<void>
}

/**
 * Port de **lecture** des commentaires, symétrique de `ArticleQueryPort`
 * (`docs/adr/011-lecture-des-listes-port-dedie.md`).
 *
 * Il renvoie des `Comment` du contrat partagé, auteur résolu en `Profile` avec
 * son `following` relatif au lecteur (R-5). Le port existe séparément de
 * l'écriture pour la même raison que côté article : chaque commentaire porte une
 * relation au lecteur, et la résoudre en boucle produirait une requête par
 * commentaire.
 *
 * La liste n'est **ni paginée ni comptée** — le contrat ne le prévoit pas
 * (REQ-COMMENT-003 AC-1), et l'ajouter ferait dévier ce dépôt de la suite de
 * conformité qui compare les implémentations Conduit.
 */
export interface CommentQueryPort {
  listByArticle(articleId: string, viewer: ViewerId): Promise<readonly Comment[]>

  /** Relecture d'un commentaire pour produire la réponse de création. */
  findById(id: number, viewer: ViewerId): Promise<Comment | null>
}

/** Jetons d'injection — voir la note de `user-repository.port.ts`. */
export const COMMENT_REPOSITORY = Symbol('CommentRepository')
export const COMMENT_QUERY = Symbol('CommentQueryPort')
