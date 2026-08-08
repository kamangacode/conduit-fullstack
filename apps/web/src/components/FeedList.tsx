'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useApi } from '../lib/api-provider'
import { type FeedKind, feedQueryKey, fetchFeed } from '../lib/feed-query'
import { ArticlePreview } from './ArticlePreview'
import { Pagination } from './Pagination'

/**
 * Liste d'articles d'un flux (REQ-WEB-009 AC-5, [ADR 015]).
 *
 * Composant **client** interrogeant TanStack Query — mais qui n'émet aucune
 * requête au chargement : le Server Component a préchargé la même clé et
 * transmis le cache déshydraté. L'aller-retour n'a lieu qu'à la navigation ou
 * après une mutation.
 *
 * La clé et la fonction de chargement viennent de `lib/feed-query` et ne sont
 * **pas** réécrites ici : une clé qui diverge d'un caractère produirait un cache
 * manqué, donc une requête au chargement et un contenu qui clignote, sans rien
 * pour l'expliquer.
 */

export interface FeedListProps {
  readonly feed: FeedKind
  readonly page: number
  /** Chemin courant, pour que la pagination conserve la route. */
  readonly pathname: string
  /** Filtres courants, reportés sur les liens de pagination. */
  readonly searchParams: URLSearchParams
}

export function FeedList({ feed, page, pathname, searchParams }: FeedListProps) {
  const api = useApi()
  const { data, isPending, isError } = useQuery({
    queryKey: feedQueryKey({ feed, page }),
    queryFn: () => fetchFeed(api, { feed, page }),
  })

  // Aucun de ces trois états ne porte `.article-preview`, et ce n'est pas un
  // détail : le contrat de sélecteurs E2E **compte** cette classe pour compter
  // les articles. Un indicateur de chargement qui la portait — première version
  // de ce fichier — se faisait décompter comme un article, et un test qui
  // vérifiait « un aperçu rendu » passait au vert sur un écran de chargement.
  if (isPending) {
    return <div className="feed-status">Loading articles...</div>
  }

  if (isError) {
    // Un échec de flux se dit, il ne se déguise pas en liste vide : « aucun
    // article » et « je n'ai pas pu charger » appellent des gestes différents
    // de la part du lecteur — attendre, ou réessayer.
    return <div className="feed-status">Unable to load articles.</div>
  }

  if (data.articles.length === 0) {
    // Classe imposée par le contrat de sélecteurs : une liste vide muette
    // laisserait le lecteur devant un écran blanc sans savoir si la page a fini
    // de charger.
    return <EmptyFeedMessage feed={feed} />
  }

  return (
    <>
      {data.articles.map((article) => (
        <ArticlePreview article={article} key={article.slug} />
      ))}
      <Pagination
        articlesCount={data.articlesCount}
        currentPage={page}
        pathname={pathname}
        searchParams={searchParams}
      />
    </>
  )
}

/**
 * Message d'absence, **spécifique au flux personnel** (REQ-WEB-009 AC-8, AC-9).
 *
 * « Aucun article » ne veut pas dire la même chose des deux côtés. Sur un flux
 * public, c'est un constat : le site est vide, ou le tag ne contient rien, et le
 * lecteur n'a rien à faire. Sur le flux personnel, c'est une **conséquence de
 * son propre état** — il ne suit personne — et le geste qui en sort est
 * d'aller voir le flux global. D'où le lien, et non seulement une phrase :
 * refermer soi-même l'impasse qu'on vient d'annoncer.
 *
 * Le lien pointe vers `/` sans paramètre : c'est ce que le contrat vise
 * (`a[href="/"]`), et cela remet aussi la page à 1 par construction.
 */
function EmptyFeedMessage({ feed }: { readonly feed: FeedKind }) {
  if (feed.kind === 'following') {
    return (
      <div className="empty-feed-message">
        Your feed is empty. <Link href="/">Read the Global Feed</Link> to find people to follow.
      </div>
    )
  }

  return <div className="empty-feed-message">No articles are here... yet.</div>
}
