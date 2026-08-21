import type { Profile } from '@repo/shared'
import type { ProfileView } from '../../application/profile/ports/profile-view'

/**
 * Traduction du read model de profil vers le contrat HTTP.
 *
 * Même rôle que `user.mapper.ts`, et même réponse à l'objection « les deux
 * formes sont identiques, donc le mapper est inutile » : elles le sont
 * aujourd'hui, et le mapper est le seul endroit où elles peuvent cesser de
 * l'être sans que `application/` connaisse le contrat (ADR 031).
 *
 * Il reste **distinct** de `toProfile` du mapper d'article, qui convertit un
 * `AuthorView`. Les deux produisent un `Profile` du contrat à partir de deux
 * read models de contextes bornés différents. Les fusionner supposerait que
 * l'auteur d'un contenu et le profil consulté resteront toujours de même forme,
 * ce que rien ne garantit.
 */
export const toProfileResponse = (view: ProfileView): Profile => ({
  username: view.username,
  bio: view.bio,
  image: view.image,
  following: view.following,
})
