/**
 * Auteur d'un article ou d'un commentaire, tel qu'une requête de lecture le
 * résout.
 *
 * `following` est relatif au lecteur, pas un attribut de l'auteur : deux
 * lecteurs obtiennent deux valeurs pour le même auteur (R-5).
 *
 * Il vit dans `application/shared/` parce qu'il est **réellement** partagé : un
 * article et un commentaire ont tous deux un auteur, et c'est le même concept,
 * résolu par la même sous-requête. Le déclarer dans le contexte article et
 * l'importer depuis le contexte commentaire recréerait, un étage plus haut,
 * l'arête `comment -> article` que le déplacement de `ViewerId` a supprimée au
 * domaine.
 *
 * Distinct de `ProfileView` du contexte `profile` malgré une forme identique, et
 * la distinction est cohérente avec ce qui précède plutôt que contradictoire :
 * `AuthorView` est **un** concept partagé par deux contextes de lecture,
 * `ProfileView` est le résultat d'un cas d'usage différent (« consulter un
 * profil »). On partage ce qui est le même, on sépare ce qui ne l'est pas ;
 * l'identité de forme n'est le critère ni dans un sens ni dans l'autre.
 */
export interface AuthorView {
  readonly username: string
  readonly bio: string | null
  readonly image: string | null
  readonly following: boolean
}
