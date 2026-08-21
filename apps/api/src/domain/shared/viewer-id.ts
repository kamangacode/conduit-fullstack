/**
 * Identité du lecteur d'une ressource, dont dépendent `favorited` et
 * `following` (règle R-5).
 *
 * `null` est l'appelant anonyme, et il est explicite dans les signatures plutôt
 * qu'implicite dans un paramètre optionnel : sur un endpoint à authentification
 * facultative, oublier de transmettre le lecteur produit une réponse
 * parfaitement valide où tout vaut `false`. Rendre le paramètre obligatoire
 * force à écrire `null`, donc à décider.
 *
 * Ce type était déclaré dans `article-query.port.ts`, d'où le port de
 * commentaire l'importait : une arête `comment` vers `article` que rien ne
 * justifiait, née de l'endroit où le type avait été écrit en premier. Il vit
 * désormais dans `domain/shared/`, parce qu'il est réellement partagé par
 * plusieurs contextes sans appartenir à aucun.
 */
export type ViewerId = string | null
