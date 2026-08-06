import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { FeedList } from '../components/FeedList'
import { FeedToggle } from '../components/FeedToggle'
import { PopularTags } from '../components/PopularTags'
import { prefetchFeed, resolveFeed } from '../lib/feed-query'
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
 */

export interface HomePageProps {
  readonly tag?: string | undefined
  readonly searchParams: Record<string, string | string[] | undefined>
}

export async function HomePage({ tag, searchParams }: HomePageProps) {
  const feedParam = firstValue(searchParams.feed)
  const page = pageFromParam(firstValue(searchParams.page))

  // Le serveur est anonyme (ADR 012) : il ne peut pas résoudre un flux
  // personnel, et ne doit surtout pas essayer — l'appel partirait sans jeton.
  // C'est `FeedToggle`, côté client, qui proposera l'onglet, et le client qui
  // chargera ce flux-là.
  const feed = resolveFeed({ tag, feedParam, isAuthenticated: false })

  const queryClient = new QueryClient()
  await prefetchFeed(queryClient, createServerApiClient(), { feed, page })

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
            <FeedToggle feed={feed} />
            <HydrationBoundary state={dehydrate(queryClient)}>
              <FeedList
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
function pathnameFor(feed: ReturnType<typeof resolveFeed>, tag: string | undefined): string {
  return feed.kind === 'tag' && tag ? `/tag/${encodeURIComponent(tag)}` : '/'
}

/** Filtres à reporter sur les liens de pagination — le tag vit dans le chemin. */
function toSearchParams(feedParam: string | undefined): URLSearchParams {
  return new URLSearchParams(feedParam ? { feed: feedParam } : {})
}
