import { CommentNotOwnedError } from './comment.errors'

/**
 * État persisté d'un commentaire, tel que le domaine le manipule.
 *
 * L'`id` est un **entier**, pas un UUID : le contrat officiel le déclare ainsi
 * et l'expose dans `DELETE /api/articles/:slug/comments/:id`, ce qui a conduit à
 * aligner la persistance sur le contrat plutôt que l'inverse
 * (`docs/adr/004-persistance-alignee-sur-le-contrat.md`). Le commentaire est la
 * seule entité du modèle dans ce cas.
 *
 * `articleId` et `authorId` sont des références par identifiant : le contexte
 * `comment` ne duplique ni l'article ni l'utilisateur (Context Mapping,
 * rule 12).
 */
export interface CommentProps {
  readonly id: number
  readonly body: string
  readonly articleId: string
  readonly authorId: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Le commentaire, agrégat du contexte `comment`.
 *
 * Il n'a **pas** de `withChanges` : le contrat RealWorld n'expose aucun endpoint
 * d'édition de commentaire. Un commentaire se crée et se supprime, rien d'autre.
 * Ajouter une méthode de modification créerait une capacité que rien n'appelle,
 * et qu'un adapter finirait par câbler « puisqu'elle existe ».
 */
export class CommentEntity {
  private constructor(private readonly props: CommentProps) {}

  /** Reconstitution depuis la persistance, tolérante par contrat (rule 12). */
  static fromProps(props: CommentProps): CommentEntity {
    return new CommentEntity(props)
  }

  get id(): number {
    return this.props.id
  }

  get body(): string {
    return this.props.body
  }

  get articleId(): string {
    return this.props.articleId
  }

  get authorId(): string {
    return this.props.authorId
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isAuthoredBy(userId: string): boolean {
    return this.props.authorId === userId
  }

  /**
   * Le commentaire appartient-il bien à l'article désigné par l'URL
   * (REQ-COMMENT-004 AC-4) ?
   *
   * La route porte deux identifiants et la tentation est d'ignorer le premier,
   * puisque le second suffit à retrouver le commentaire. C'est le motif exact
   * d'un IDOR : un chemin qui affirme une relation que le code ne vérifie pas.
   * Inoffensif ici — l'auteur ne peut de toute façon supprimer que son propre
   * commentaire — mais la même négligence sur la garde de propriété serait, elle,
   * exploitable. On vérifie parce que le chemin l'affirme.
   */
  belongsToArticle(articleId: string): boolean {
    return this.props.articleId === articleId
  }

  /**
   * Garde de la règle R-6 restreinte au commentaire (REQ-COMMENT-004 AC-2).
   *
   * L'auteur de l'**article** n'a aucun droit ici : le contrat ne prévoit pas de
   * modération, et R-6 ne parle que de l'auteur du commentaire. Étendre le droit
   * au propriétaire du fil serait une règle inventée, invisible dans la suite de
   * conformité et divergente des autres implémentations Conduit.
   *
   * Comme pour l'article, cette garde est une seconde barrière : la première est
   * le filtrage par propriétaire dans la requête SQL (rule 19).
   */
  assertDeletableBy(userId: string): void {
    if (!this.isAuthoredBy(userId)) {
      throw new CommentNotOwnedError()
    }
  }
}
