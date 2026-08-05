/**
 * Avatar par défaut (REQ-WEB-007 AC-3/AC-4, [ADR 014]).
 *
 * Le champ `image` d'un compte est nullable (ADR 004) et la spec RealWorld
 * prévoit explicitement le repli : « When a user has no profile image,
 * implementations should display the default avatar ». Le contrat de sélecteurs
 * E2E en fait une assertion — le `src` des avatars doit **contenir**
 * `default-avatar.svg`.
 *
 * Ce module existe parce que le repli est nécessaire à quatre endroits au moins
 * (barre de navigation, page de profil, méta d'article, commentaires) et qu'un
 * `?? '/default-avatar.svg'` recopié à chacun d'eux est l'exemple type de la
 * règle qu'on oublie au cinquième — celui qu'on ajoutera en F5.
 */

/**
 * Fichier **vendoré** dans `public/`, comme le thème.
 *
 * Servi depuis l'application et non depuis un CDN : le contrat exige que le
 * `src` contienne ce nom de fichier, ce qu'une URL tierce ne garantit pas dans
 * la durée. Le SVG vient du dépôt RealWorld de référence.
 */
export const DEFAULT_AVATAR_URL = '/default-avatar.svg'

/**
 * URL d'affichage d'un avatar, repli compris.
 *
 * La chaîne vide est traitée comme une **absence**, et ce n'est pas une
 * précaution gratuite : le formulaire de paramètres envoie `''` quand
 * l'utilisateur efface son URL d'image, là où un compte jamais renseigné porte
 * `null`. Ne traiter que `null` produirait un `src=""` — donc, selon le
 * navigateur, une requête vers la page courante et une image cassée.
 */
export function avatarUrl(image: string | null | undefined): string {
  return image?.trim() ? image : DEFAULT_AVATAR_URL
}
