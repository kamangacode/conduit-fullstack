import type { User } from '@repo/shared'
import type { AccountView } from '../../application/user/account-view'

/**
 * Traduction du read model de compte vers le contrat HTTP.
 *
 * Rien à sérialiser ici : `AccountView` et `User` ont aujourd'hui la même forme,
 * tous champs scalaires. Le mapper existe quand même, et ce n'est pas de la
 * cérémonie — c'est le point où les deux formes peuvent diverger sans que le use
 * case bouge (ADR 031). Sans lui, `application/` importerait `@repo/shared` pour
 * annoncer son type de retour, ce qui est exactement le couplage retiré.
 *
 * Écrit champ par champ plutôt que par étalement : `passwordHash` n'existe pas
 * dans `AccountView`, donc le typage l'interdit déjà, mais l'énumération fait
 * qu'un champ ajouté demain au read model ne part pas sur le fil par défaut.
 */
export const toUserResponse = (view: AccountView): User => ({
  email: view.email,
  token: view.token,
  username: view.username,
  bio: view.bio,
  image: view.image,
})
