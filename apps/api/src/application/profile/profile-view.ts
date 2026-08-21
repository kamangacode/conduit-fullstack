import type { UserEntity } from '../../domain/user/user'

/**
 * Projection **publique** d'un compte (PRD §8, REQ-PROFILE-002).
 *
 * `following` est un paramètre du cas d'usage et non un attribut du compte : la
 * relation appartient au couple (appelant, cible), pas au compte consulté
 * (règle R-5). Deux appelants obtiennent deux valeurs pour le même profil.
 *
 * Distincte de `AuthorView` du contexte article malgré une forme identique. Les
 * deux ne répondent pas à la même question : celle-ci est le résultat du cas
 * d'usage « consulter un profil », l'autre décrit l'auteur d'un contenu résolu
 * au passage d'une requête de liste. Les fusionner coupleraient deux contextes
 * bornés pour la seule raison qu'ils ont aujourd'hui les mêmes champs, et la
 * fusion serait à défaire dès que l'un des deux gagne un champ que l'autre n'a
 * pas.
 */
export interface ProfileView {
  readonly username: string
  readonly bio: string | null
  readonly image: string | null
  readonly following: boolean
}

/**
 * Construit la projection publique d'un compte.
 *
 * Écrite champ par champ, jamais par étalement de l'entité : un `...props`
 * emporterait `email` et `passwordHash` dans une réponse publique. `ProfileView`
 * ne les déclare pas, donc le typage l'interdit déjà — l'énumération explicite
 * ajoute qu'un champ nouveau ne fuite pas par défaut, et qu'il faudra une
 * décision consciente pour l'exposer.
 *
 * Cette projection vivait sur `UserEntity` (`toProfile(following)`) jusqu'au
 * 2026-08-21, où elle fabriquait directement le `Profile` du contrat (ADR 031).
 */
export const toProfileView = (user: UserEntity, following: boolean): ProfileView => ({
  username: user.username,
  bio: user.bio,
  image: user.image,
  following,
})
