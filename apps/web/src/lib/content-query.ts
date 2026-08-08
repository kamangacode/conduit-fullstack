import type { Article, ArticlesResponse, Comment } from '@repo/shared'
import type { Query, QueryClient } from '@tanstack/react-query'
import { FEED_QUERY_PREFIX } from './feed-query'

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
 * Écrit dans le cache l'article que l'API vient de confirmer, et retire l'entrée
 * du slug qu'il portait avant lorsque l'enregistrement l'a changé.
 *
 * **Le trou que ce helper ferme.** Depuis l'[ADR 020], `/article/:slug` et
 * `/editor/:slug` chargent depuis le navigateur : elles ont donc perdu la
 * réparation implicite qu'apportait l'hydratation. `hydrate` remplace une entrée
 * dès que la donnée déshydratée est plus récente, si bien qu'une navigation vers
 * une page préchargée écrasait le cache client avec ce que le serveur venait de
 * lire. Sur ces routes-là, **le cache client fait désormais autorité** : une
 * mutation qui n'y écrit rien laisse `staleTime: 30_000` servir l'état d'avant,
 * et plus rien ne vient le corriger.
 *
 * Le symptôme mesuré : enregistrer un article **sans toucher au titre** — donc à
 * slug inchangé, donc sur la même clé — puis suivre la redirection affiche
 * l'article d'avant l'enregistrement pendant trente secondes, étiquettes retirées
 * comprises. Le parcours frère qui renomme l'article était vert par accident : le
 * slug régénéré menait à une clé vide, donc chargée depuis l'API.
 *
 * On **écrit** la réponse plutôt que d'invalider l'entrée : c'est le geste que
 * `ArticleMeta` pose déjà pour le favori, et celui que le docblock de `staleTime`
 * (`api-provider.tsx`) affirme — « les mutations mettent l'affichage à jour
 * depuis la réponse de l'API, sans attendre un refetch ». Invalider coûterait un
 * aller-retour et, pendant sa durée, continuerait d'afficher l'ancien contenu :
 * l'auteur verrait ses étiquettes revenir une fraction de seconde.
 *
 * L'entrée de l'ancien slug est **retirée**, pas écrasée : la ressource n'existe
 * plus sous ce slug (l'API y répond 404), et une entrée fraîche qui la décrirait
 * encore servirait un article fantôme à qui reviendrait en arrière.
 *
 * Vit ici, à côté des clés qu'il écrit, pour la même raison
 * qu'`invalidateAuthorCaches` : quelles entrées un enregistrement rend fausses
 * est une propriété du **modèle de cache**, pas de l'écran qui enregistre.
 *
 * [ADR 020]: ../../../../docs/adr/020-chargement-client-des-pages-de-contenu.md
 */
export function cacheSavedArticle(
  queryClient: QueryClient,
  saved: Article,
  previousSlug?: string
): void {
  queryClient.setQueryData(articleQueryKey(saved.slug), saved)

  if (previousSlug !== undefined && previousSlug !== saved.slug) {
    // `exact` : sans lui, la clé serait traitée comme un préfixe. Elle n'a
    // aujourd'hui aucun descendant, mais une clé plus fine posée demain
    // (`['article', slug, …]`) disparaîtrait sans que rien ne le signale.
    queryClient.removeQueries({ queryKey: articleQueryKey(previousSlug), exact: true })
  }
}

/**
 * Invalide, pour un ou plusieurs usernames, **toutes** les entrées de cache qui
 * portent une copie de leur compte — pas seulement `profileQueryKey`.
 *
 * Un article **comme un commentaire** embarque un instantané de son auteur
 * (username, bio, image) plutôt qu'une référence : c'est le format de l'API
 * (PRD §8 « Multiple Articles », « Single Article », « Single Comment »), pas un
 * choix du front. Cet instantané vit donc dans trois familles de clés distinctes
 * de celle du profil : `articleQueryKey` (détail), les clés de flux préfixées
 * `FEED_QUERY_PREFIX` (`feedQueryKey`, listes de l'accueil comme du profil) et
 * `commentsQueryKey` (fil d'un article). N'invalider que le profil laisserait
 * ces copies périmées visibles partout où l'auteur apparaît déjà en cache — la
 * méta d'un article qu'il a écrit, une carte dans un flux, son avatar sous un
 * commentaire — jusqu'à l'expiration naturelle de `staleTime`.
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
 * Une entrée `article` (détail), de flux ou `comments` porte-t-elle, dans les
 * données déjà reçues, un des auteurs visés ?
 *
 * Lit `query.state.data` plutôt que de reconstruire la clé : les flux sont
 * paramétrés par un `FeedKind` que ce module ignore volontairement (couplage
 * que `feed-query.ts` seul justifie), et une entrée sans données n'a de toute
 * façon rien à invalider — elle n'a jamais été chargée.
 *
 * Les préfixes `article` et `comments` restent des littéraux : ils sont ceux des
 * deux constructeurs de clés écrits **juste au-dessus**, donc lisibles d'un même
 * coup d'œil. Celui des flux ne l'est pas — il appartient à `feed-query.ts` — et
 * c'est pourquoi lui seul arrive par un import.
 */
function embedsAuthor(query: Query, usernames: ReadonlySet<string>): boolean {
  const [resource] = query.queryKey

  if (resource === 'article') {
    const article = query.state.data as Article | undefined
    return article !== undefined && usernames.has(article.author.username)
  }

  if (resource === FEED_QUERY_PREFIX) {
    const response = query.state.data as ArticlesResponse | undefined
    return (response?.articles ?? []).some((article) => usernames.has(article.author.username))
  }

  if (resource === 'comments') {
    // `getComments` déballe l'enveloppe `{ comments: [...] }` : la donnée en
    // cache est le tableau lui-même, pas la réponse.
    const comments = query.state.data as Comment[] | undefined
    return (comments ?? []).some((comment) => usernames.has(comment.author.username))
  }

  return false
}
