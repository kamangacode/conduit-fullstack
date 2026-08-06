/**
 * Clés de cache des ressources chargées **depuis le navigateur** ([ADR 020]).
 *
 * Écrites ici plutôt que dans chaque composant, pour la raison qui a déjà valu
 * à `feed-query.ts` d'exister : une clé recopiée qui diverge d'un caractère ne
 * produit aucune erreur. Elle produit un cache manqué — donc une requête de
 * plus, un contenu qui clignote, et rien pour l'expliquer.
 *
 * Elles sont **préfixées par la ressource** et non par la page : deux pages qui
 * affichent le même article doivent partager son entrée de cache, sans quoi
 * favoriser depuis la liste laisserait la page de l'article afficher l'ancien
 * compteur.
 */

/** Un article, par le slug qui l'identifie dans l'URL. */
export function articleQueryKey(slug: string): readonly unknown[] {
  return ['article', slug]
}

/**
 * Les commentaires d'un article.
 *
 * Une clé distincte de celle de l'article, et non un champ de celui-ci : les
 * deux évoluent séparément — publier un commentaire ne change pas l'article, et
 * recharger l'article ne doit pas invalider une liste qu'on vient de compléter.
 */
export function commentsQueryKey(slug: string): readonly unknown[] {
  return ['comments', slug]
}

/** Un profil public, par le username qui l'identifie dans l'URL. */
export function profileQueryKey(username: string): readonly unknown[] {
  return ['profile', username]
}
