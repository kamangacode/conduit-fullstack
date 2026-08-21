import type { Comment, CommentsResponse } from '@repo/shared'
import type { CommentView } from '../../application/comment/ports/comment-view'
import { toProfile } from './article.mapper'

/**
 * Traduction des read models de commentaire vers le contrat HTTP.
 *
 * Même rôle et mêmes règles que `article.mapper.ts` : les `Date` deviennent des
 * chaînes ISO 8601, les enveloppes naissent ici, et rien en dessous de
 * `interface/` ne connaît la forme du fil (ADR 031).
 *
 * `toProfile` est réutilisé depuis le mapper d'article. C'est le pendant, côté
 * transport, du partage de `AuthorView` côté read model : l'auteur d'un
 * commentaire et l'auteur d'un article produisent le même `Profile`, et deux
 * conversions séparées finiraient par diverger sur un champ.
 */

/** Commentaire unitaire (PRD §8 « Single Comment »). */
export const toComment = (view: CommentView): Comment => ({
  id: view.id,
  createdAt: view.createdAt.toISOString(),
  updatedAt: view.updatedAt.toISOString(),
  body: view.body,
  author: toProfile(view.author),
})

/**
 * Enveloppe de liste (PRD §8 « Multiple Comments »).
 *
 * Ni pagination ni compteur : le contrat n'en prévoit pas (REQ-COMMENT-003
 * AC-1). L'absence est ici une décision, pas un oubli — l'ajouter ferait dévier
 * ce dépôt de la suite de conformité qui compare les implémentations Conduit.
 */
export const toCommentsResponse = (views: readonly CommentView[]): CommentsResponse => ({
  comments: views.map(toComment),
})
