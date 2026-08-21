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
 * Port d'**écriture** des commentaires.
 *
 * Il manipule `CommentEntity`, l'agrégat porteur de la règle d'appartenance
 * (R-6), et c'est ce qui le fait vivre dans `domain/` : un port vit là où vit ce
 * qu'il protège (ADR 031). Son jumeau de lecture,
 * `application/comment/ports/comment-query.port.ts`, ne protège rien et sert un
 * affichage.
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

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const COMMENT_REPOSITORY = Symbol('CommentRepository')
