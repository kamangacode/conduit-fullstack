import { z } from 'zod'
import { CONTRACT_MESSAGES } from '../errors/contract-messages'
import { contractEmail, minLengthText, nullableText, requiredText } from './contract-fields'

/**
 * Longueur minimale du mot de passe.
 *
 * Cette constante a été posée avant que la suite de conformité ne tourne, avec
 * la note qu'elle bougerait si la suite s'inscrivait avec un secret plus court.
 * La suite a tranché dans l'autre sens et l'a confirmée : `errors_auth.hurl`
 * refuse `short7c` (7 caractères) par un 422 et accepte `bonjour1` (8) par un
 * 200, en citant la politique NIST 800-63B. Ce qui était un choix par défaut est
 * devenu une exigence du contrat.
 *
 * La même section impose d'accepter au moins 64 caractères : aucun maximum n'est
 * donc déclaré, et il ne faut pas en ajouter.
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
  email: contractEmail(),
  password: requiredText(),
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
  username: requiredText(),
  email: contractEmail(),
  password: minLengthText(PASSWORD_MIN_LENGTH, CONTRACT_MESSAGES.passwordTooShort),
})

export type RegisterDto = z.infer<typeof registerDtoSchema>

export const registerRequestSchema = z.object({ user: registerDtoSchema })

export type RegisterRequest = z.infer<typeof registerRequestSchema>

/**
 * Mise à jour du compte — `PUT /api/user` (PRD §7.1).
 *
 * Tous les champs sont optionnels : seuls ceux présents sont modifiés. `bio` et
 * `image` sont nullables et non seulement optionnels, car le contrat distingue
 * **trois** intentions et non deux — omettre le champ (ne pas y toucher),
 * l'envoyer à `null` (l'effacer), et l'envoyer à la chaîne vide (l'effacer
 * aussi). C'est la troisième qui manquait : `nullableText` la normalise, de
 * sorte que le domaine n'en voie jamais que deux (REQ-USER-005).
 *
 * La normalisation ne touche **que** les champs nullables. `username` et
 * `email` reçus vides restent un refus : les normaliser produirait un compte
 * sans nom.
 */
export const updateUserDtoSchema = z.object({
  email: contractEmail().optional(),
  username: requiredText().optional(),
  password: minLengthText(PASSWORD_MIN_LENGTH, CONTRACT_MESSAGES.passwordTooShort).optional(),
  bio: nullableText().optional(),
  image: nullableText().optional(),
})

export type UpdateUserDto = z.infer<typeof updateUserDtoSchema>

export const updateUserRequestSchema = z.object({ user: updateUserDtoSchema })

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>
