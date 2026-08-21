import type { AuthorView } from '../../article/ports/article-view'

/**
 * Read model d'un commentaire destiné à l'affichage.
 *
 * Possédé par le dépôt, pas importé du contrat (ADR 031) : `createdAt` est une
 * `Date`, la sérialisation ISO est le travail du mapper de `interface/`.
 *
 * `author` réutilise `AuthorView` du contexte article plutôt que de le
 * redéclarer. Ce n'est pas de l'économie de lignes : les deux décrivent
 * littéralement la même chose, l'auteur d'un contenu tel qu'une requête de
 * lecture le résout, avec un `following` relatif au lecteur (R-5). Le
 * redéclarer créerait exactement la divergence que l'ADR 001 cherchait à éviter,
 * un étage plus bas.
 */
export interface CommentView {
  readonly id: number
  readonly body: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly author: AuthorView
}
