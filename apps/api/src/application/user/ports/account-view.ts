import type { UserEntity } from '../../../domain/user/user'

/**
 * Projection **privée** d'un compte, réservée aux endpoints d'authentification
 * (PRD §8, §9).
 *
 * Elle porte l'email : c'est sa raison d'être, et ce qui la distingue de
 * `ProfileView`. Elle ne porte en revanche **jamais** `passwordHash` (règle
 * R-9), et c'est désormais le **type** qui le garantit plutôt qu'une énumération
 * vigilante dans l'entité. Un mapper qui tenterait de l'y mettre ne compilerait
 * pas.
 *
 * Cette projection vivait sur `UserEntity`, sous la forme d'une méthode
 * `toUser(token)`. C'était le cas le plus net du dépôt : une entité de domaine
 * qui prend un **JWT** en paramètre pour construire une réponse d'API. Le
 * commentaire de la méthode le reconnaissait lui-même, en notant que le jeton
 * « n'appartient pas au compte » (ADR 031).
 *
 * Le jeton est ici légitime : `AccountView` est un type **applicatif**, et c'est
 * le use case qui l'émet via `TokenService`. Ce qui a changé, c'est que le
 * domaine n'y touche plus.
 */
export interface AccountView {
  readonly email: string
  readonly token: string
  readonly username: string
  readonly bio: string | null
  readonly image: string | null
}

/**
 * Construit la projection privée d'un compte.
 *
 * Écrite champ par champ, jamais par étalement : c'est la projection la plus
 * proche de l'état complet, donc celle où un `...props` serait le plus tentant
 * et le plus coûteux. Le typage de `AccountView` interdit déjà `passwordHash` ;
 * l'énumération explicite fait qu'un champ ajouté à `UserProps` demain ne
 * remonte pas ici par défaut.
 */
export const toAccountView = (user: UserEntity, token: string): AccountView => ({
  email: user.email,
  token,
  username: user.username,
  bio: user.bio,
  image: user.image,
})
