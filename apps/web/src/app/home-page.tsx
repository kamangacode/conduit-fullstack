import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { HomeFeed } from '../components/HomeFeed'
import { PopularTags } from '../components/PopularTags'
import { type FeedKind, isPublicFeed, prefetchFeed, requestedFeed } from '../lib/feed-query'
import { pageFromParam } from '../lib/pagination'
import { createServerApiClient } from '../lib/server-api-client'

/**
 * Page d'accueil (REQ-WEB-009), partagée par `/` et `/tag/:tag`.
 *
 * Les deux routes affichent la **même** page — seule la source du tag change
 * (chemin plutôt que rien). Les écrire deux fois donnerait deux markups à garder
 * cohérents, exactement le motif de dérive parallèle que l'ADR 015 a écarté en
 * choisissant un seul chemin de données.
 *
 * **Server Component** qui précharge le flux et transmet le cache déshydraté
 * ([ADR 015]) : le HTML initial contient déjà les articles, et `FeedList` monte
 * côté client sans émettre de requête.
 *
 * Il ne transmet que le flux **demandé** par l'URL ([ADR 022]) : qui a le droit
 * de voir le flux personnel se décide dans `HomeFeed`, côté client, une fois la
 * session résolue.
 */

export interface HomePageProps {
  readonly tag?: string | undefined
  readonly searchParams: Record<string, string | string[] | undefined>
}

export async function HomePage({ tag, searchParams }: HomePageProps) {
  const feedParam = firstValue(searchParams.feed)
  const page = pageFromParam(firstValue(searchParams.page))

  const feed = requestedFeed({ tag, feedParam })

  const queryClient = new QueryClient()

  // Le serveur est anonyme (ADR 012) : il ne peut précharger qu'un flux public,
  // et ne doit surtout pas essayer sur `following` — l'appel partirait sans
  // jeton et reviendrait en 401 (ADR 015 §4). La condition est portée par
  // `isPublicFeed` plutôt que par une vigilance de relecture.
  if (isPublicFeed(feed)) {
    await prefetchFeed(queryClient, createServerApiClient(), { feed, page })
  }

  return (
    <div className="home-page">
      <div className="banner">
        <div className="container">
          <h1 className="logo-font">conduit</h1>
          <p>A place to share your knowledge.</p>
        </div>
      </div>

      <div className="container page">
        <div className="row">
          <div className="col-md-9">
            <HydrationBoundary state={dehydrate(queryClient)}>
              <HomeFeed
                feed={feed}
                page={page}
                pathname={pathnameFor(feed, tag)}
                searchParams={toSearchParams(feedParam)}
              />
            </HydrationBoundary>
          </div>

          <div className="col-md-3">
            <PopularTags />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Premier élément d'un paramètre de requête.
 *
 * Next.js rend `string | string[]` : un `?page=1&page=2` forgé à la main
 * arriverait sous forme de tableau, et le passer tel quel à `Number()`
 * produirait `NaN` — que `pageFromParam` traite, mais autant ne pas lui envoyer
 * une forme qu'on peut réduire ici.
 */
function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

/** Chemin courant, que la pagination doit conserver. */
function pathnameFor(feed: FeedKind, tag: string | undefined): string {
  return feed.kind === 'tag' && tag ? `/tag/${encodeURIComponent(tag)}` : '/'
}

/** Filtres à reporter sur les contrôles de pagination — le tag vit dans le chemin. */
function toSearchParams(feedParam: string | undefined): URLSearchParams {
  return new URLSearchParams(feedParam ? { feed: feedParam } : {})
}
