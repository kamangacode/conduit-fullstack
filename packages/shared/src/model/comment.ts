import { z } from 'zod'
import { requiredText } from './contract-fields'
import { profileSchema } from './profile'

/**
 * Commentaire attaché à un article (PRD §6, format §8 « Single Comment »).
 *
 * L'`id` est un **entier**, pas un UUID : le contrat officiel le déclare
 * `type: integer` (`openapi.yml`) et le format de réponse le montre sérialisé
 * en nombre (`"id": 1`). Le schéma de persistance a été aligné sur le contrat
 * plutôt que l'inverse — décision et conséquences dans
 * `docs/adr/004-persistance-alignee-sur-le-contrat.md`.
 */
export const commentSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  body: z.string(),
  author: profileSchema,
})

export type Comment = z.infer<typeof commentSchema>

/** Enveloppe `{ "comment": … }` (PRD §8). */
export const commentResponseSchema = z.object({ comment: commentSchema })

export type CommentResponse = z.infer<typeof commentResponseSchema>

/**
 * Enveloppe `{ "comments": [...] }` (PRD §8).
 *
 * Contrairement aux articles, la spec ne prévoit **ni compteur ni pagination**
 * sur les commentaires : la liste est renvoyée entière. On ne l'ajoute pas ici,
 * pour ne pas faire dévier le contrat de la suite de conformité.
 */
export const commentsResponseSchema = z.object({ comments: z.array(commentSchema) })

export type CommentsResponse = z.infer<typeof commentsResponseSchema>

/**
 * Ajout — `POST /api/articles/:slug/comments` (PRD §7.4).
 *
 * L'auteur ne figure pas dans le DTO : il est dérivé du JWT vérifié côté API,
 * jamais du corps de la requête (règle de server-side authority,
 * `.claude/rules/19-securite.md`). Un champ `author` accepté ici permettrait de
 * commenter au nom d'un autre.
 */
export const createCommentDtoSchema = z.object({
  body: requiredText(),
})

export type CreateCommentDto = z.infer<typeof createCommentDtoSchema>

export const createCommentRequestSchema = z.object({ comment: createCommentDtoSchema })

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>
