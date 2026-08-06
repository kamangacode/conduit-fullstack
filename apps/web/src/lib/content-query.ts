import type { Article, ArticlesResponse } from '@repo/shared'
import type { Query, QueryClient } from '@tanstack/react-query'

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

/**
 * Invalide, pour un ou plusieurs usernames, **toutes** les entrées de cache qui
 * portent une copie de leur compte — pas seulement `profileQueryKey`.
 *
 * Chaque article embarque un instantané de son auteur (username, bio, image)
 * plutôt qu'une référence : c'est le format de l'API (PRD §8 « Multiple
 * Articles » et « Single Article »), pas un choix du front. Cet instantané vit
 * dans deux familles de clés distinctes de celle du profil : `articleQueryKey`
 * (détail) et les clés de flux préfixées `articles` (`feedQueryKey`, listes de
 * l'accueil comme du profil). N'invalider que le profil laisserait ces copies
 * périmées visibles partout où l'auteur apparaît déjà en cache — la méta d'un
 * article qu'il a écrit, une carte dans un flux — jusqu'à l'expiration
 * naturelle de `staleTime`.
 *
 * Vit ici, à côté des clés qu'elle invalide, plutôt que dans la page qui
 * déclenche l'enregistrement (REQ-WEB-004) : quelles ressources dénormalisent
 * l'auteur est une propriété du **modèle de cache**, pas de la page de
 * paramètres. Une future page qui modifierait un compte autrement (import,
 * modération…) la retrouverait sinon dupliquée, ou pire, oubliée.
 *
 * Volontairement **non attendue** par l'appelant : chaque `invalidateQueries`
 * marque son entrée obsolète de façon synchrone, avant même de renvoyer sa
 * promesse — c'est ce marquage qui compte pour la page suivante. La promesse
 * elle-même ne se résout qu'après le rafraîchissement en arrière-plan des
 * requêtes actives, qui peut être lent ou ne jamais aboutir (perte réseau) sans
 * remettre en cause l'enregistrement déjà réussi. Y suspendre la navigation
 * transformerait un cache lent en formulaire bloqué.
 */
export function invalidateAuthorCaches(
  queryClient: QueryClient,
  usernames: readonly string[]
): void {
  const targets = new Set(usernames)

  for (const username of targets) {
    void queryClient.invalidateQueries({ queryKey: profileQueryKey(username) })
  }

  void queryClient.invalidateQueries({ predicate: (query) => embedsAuthor(query, targets) })
}

/**
 * Une entrée `article` (détail) ou `articles` (flux) porte-t-elle, dans les
 * données déjà reçues, un des auteurs visés ?
 *
 * Lit `query.state.data` plutôt que de reconstruire la clé : les flux sont
 * paramétrés par un `FeedKind` que ce module ignore volontairement (couplage
 * que `feed-query.ts` seul justifie), et une entrée sans données n'a de toute
 * façon rien à invalider — elle n'a jamais été chargée.
 */
function embedsAuthor(query: Query, usernames: ReadonlySet<string>): boolean {
  const [resource] = query.queryKey

  if (resource === 'article') {
    const article = query.state.data as Article | undefined
    return article !== undefined && usernames.has(article.author.username)
  }

  if (resource === 'articles') {
    const response = query.state.data as ArticlesResponse | undefined
    return (response?.articles ?? []).some((article) => usernames.has(article.author.username))
  }

  return false
}
