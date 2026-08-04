import { z } from 'zod'

/**
 * Tag : une simple chaîne, pas une entité riche (PRD §6).
 *
 * Le `.trim()` fait partie du schéma et non des use cases : un tag saisi
 * `" dragons "` côté formulaire et un tag `"dragons"` saisi côté API doivent
 * produire la même valeur, sinon la sidebar « Popular Tags » se retrouve avec
 * deux entrées pour un même sujet. Normaliser au bord, une seule fois, est ce
 * qui rend la règle indépendante de l'appelant.
 */
export const tagSchema = z.string().trim().min(1)

export type Tag = z.infer<typeof tagSchema>

/** Enveloppe de réponse `{ "tags": [...] }` (PRD §7.5, §8 « List of Tags »). */
export const tagsResponseSchema = z.object({ tags: z.array(tagSchema) })

export type TagsResponse = z.infer<typeof tagsResponseSchema>
