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
 * Ce type vivait dans `domain/article/ports/article-query.port.ts`, d'où le port
 * de commentaire l'importait : une arête `domain/comment` vers `domain/article`
 * que rien ne justifiait, née de l'endroit où le type avait été écrit en
 * premier. Il vit désormais là où il appartient — c'est une notion de lecture,
 * donc applicative (ADR 031), et partagée par tous les contextes.
 */
export type ViewerId = string | null
