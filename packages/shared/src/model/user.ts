import { z } from 'zod'

/**
 * Longueur minimale du mot de passe à l'inscription.
 *
 * Le contrat RealWorld ne définit **aucune** politique de mot de passe
 * (`openapi.yml` déclare `password: type: string`, sans contrainte). On pose
 * donc un minimum explicite plutôt qu'implicite, isolé dans une constante : si
 * la suite de conformité Hurl (item F7) s'inscrit avec un secret plus court,
 * c'est cette seule ligne qui bouge, pas les schémas qui la consomment.
 */
export const PASSWORD_MIN_LENGTH = 8

/**
 * User : la vue **privée** d'un utilisateur, renvoyée uniquement par les
 * endpoints d'authentification (PRD §7.1, format §8 « Users »). C'est la seule
 * représentation qui porte le JWT (PRD §9).
 *
 * Le mot de passe n'y figure pas, et ce n'est pas un oubli : c'est la règle R-9.
 * C'est aussi la raison pour laquelle la sortie et les entrées sont des schémas
 * **distincts** plutôt qu'un schéma unique décliné en `.partial()` — dériver
 * l'un de l'autre ferait qu'un champ ajouté à l'entrée (un mot de passe, par
 * définition) fuiterait dans toutes les réponses d'authentification.
 */
export const userSchema = z.object({
  email: z.string(),
  /** JWT, transmis ensuite en en-tête `Authorization: Token <jwt>` (PRD §9). */
  token: z.string(),
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
})

export type User = z.infer<typeof userSchema>

/** Enveloppe de réponse `{ "user": … }` (PRD §8). */
export const userResponseSchema = z.object({ user: userSchema })

export type UserResponse = z.infer<typeof userResponseSchema>

/* ------------------------------------------------------------------ *
 * DTOs d'entrée                                                       *
 * ------------------------------------------------------------------ */

/**
 * Connexion — `POST /api/users/login` (PRD §7.1).
 *
 * Le mot de passe n'est contraint qu'à être non vide. Au login on vérifie une
 * identité, on n'applique pas une politique : exiger `PASSWORD_MIN_LENGTH`
 * renverrait un 422 de validation là où un compte dont le secret est plus court
 * doit recevoir un échec d'authentification (401).
 */
export const loginDtoSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export type LoginDto = z.infer<typeof loginDtoSchema>

/** Corps de requête enveloppé `{ "user": … }` attendu par le contrat. */
export const loginRequestSchema = z.object({ user: loginDtoSchema })

export type LoginRequest = z.infer<typeof loginRequestSchema>

/**
 * Inscription — `POST /api/users` (PRD §7.1).
 *
 * L'unicité de l'email et du username (règle R-8) n'est pas exprimable ici :
 * elle demande d'interroger la base. Elle est portée par l'API (contrainte
 * `@unique` Prisma + traduction en 422), pas par ce schéma.
 */
export const registerDtoSchema = z.object({
  username: z.string().trim().min(1),
  email: z.email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
})

export type RegisterDto = z.infer<typeof registerDtoSchema>

export const registerRequestSchema = z.object({ user: registerDtoSchema })

export type RegisterRequest = z.infer<typeof registerRequestSchema>

/**
 * Mise à jour du compte — `PUT /api/user` (PRD §7.1).
 *
 * Tous les champs sont optionnels : seuls ceux présents sont modifiés. `bio` et
 * `image` sont `.nullable().optional()` et non `.optional()` seul, car le
 * contrat distingue deux intentions — omettre le champ (ne pas y toucher) et
 * l'envoyer à `null` (l'effacer).
 */
export const updateUserDtoSchema = z.object({
  email: z.email().optional(),
  username: z.string().trim().min(1).optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH).optional(),
  bio: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
})

export type UpdateUserDto = z.infer<typeof updateUserDtoSchema>

export const updateUserRequestSchema = z.object({ user: updateUserDtoSchema })

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>
