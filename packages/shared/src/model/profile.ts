import { z } from 'zod'

/**
 * Profil : la vue **publique** d'un utilisateur (PRD §6, format §8 « Profile »).
 *
 * `following` n'est pas un attribut stocké de l'utilisateur : c'est une valeur
 * calculée relativement à l'utilisateur courant (règle R-5), donc toujours
 * `false` pour un visiteur anonyme. Elle appartient à la représentation
 * transportée, pas à la table `users` — c'est pourquoi ce schéma ne reflète pas
 * le modèle Prisma champ pour champ, et n'a pas vocation à le faire.
 */
export const profileSchema = z.object({
  username: z.string(),
  /** Nullable dans le contrat officiel (`openapi.yml` : `type: [string, 'null']`). */
  bio: z.string().nullable(),
  /** URL d'avatar. Nullable : la spec autorise un profil sans image. */
  image: z.string().nullable(),
  /** Relatif à l'utilisateur courant (R-5). */
  following: z.boolean(),
})

export type Profile = z.infer<typeof profileSchema>

/** Enveloppe de réponse `{ "profile": … }` (PRD §8). */
export const profileResponseSchema = z.object({ profile: profileSchema })

export type ProfileResponse = z.infer<typeof profileResponseSchema>
