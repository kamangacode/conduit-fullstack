'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { FeedKind } from '../lib/feed-query'
import { type SessionStatus, useSession } from '../lib/session'
import { FeedList } from './FeedList'
import { FeedToggle } from './FeedToggle'

/**
 * Résolution du flux de l'accueil, et garde du flux personnel
 * (REQ-WEB-009 AC-3, AC-7, AC-10, AC-11 ; [ADR 022]).
 *
 * Ce composant existe parce que la garde ne peut pas être ailleurs. La session
 * ne quitte pas le navigateur (ADR 012) : ni cookie, ni session serveur, donc
 * **aucun middleware Next ne peut arbitrer `/?feed=following`** — il n'aurait
 * rien à lire. Le serveur transmet le flux *demandé* par l'URL, et c'est ici que
 * l'on décide ce qu'il en advient.
 *
 * Deux pièges, tous deux déjà payés dans ce dépôt :
 *
 * 1. **La garde ne s'écrit pas sur `user === null`.** Trois des quatre états de
 *    session ont `user === null` (`pending`, `anonymous`, `unavailable`).
 *    Rediriger sur cette condition éjecte les lecteurs connectés pendant la
 *    fenêtre de réhydratation — le défaut déjà corrigé sur `/settings`. Elle
 *    s'écrit sur `status === 'anonymous'`, et seulement sur lui.
 * 2. **La liste ne se monte pas avant `authenticated`.** `api-client` prend le
 *    jeton dans la session ; monter `FeedList` avec `feed=following` alors que
 *    le jeton est encore `null` émettrait un `GET /articles/feed` anonyme, qui
 *    reviendrait en 401 et afficherait un échec là où le lecteur attend sa
 *    liste.
 *
 * `unavailable` (jeton conservé, API invérifiable — REQ-WEB-016) ne redirige
 * pas : un lecteur dont l'API est en rade n'est pas un anonyme, et l'envoyer au
 * formulaire de connexion lui ferait tenter une action qui échouera aussi.
 */

export interface HomeFeedProps {
  /** Flux **demandé par l'URL**, pas le flux résolu (ADR 022). */
  readonly feed: FeedKind
  readonly page: number
  /** Chemin courant, que la pagination doit conserver. */
  readonly pathname: string
  /** Filtres courants, reportés sur les contrôles de pagination. */
  readonly searchParams: URLSearchParams
}

export function HomeFeed({ feed, page, pathname, searchParams }: HomeFeedProps) {
  const { status } = useSession()
  const router = useRouter()
  // Le seul flux dont l'accès dépende du lecteur. Les autres sont publics : le
  // serveur les a déjà préchargés, il n'y a rien à garder.
  const personal = feed.kind === 'following'

  useEffect(() => {
    if (personal && status === 'anonymous') {
      // `replace` et non `push` : l'URL du flux personnel n'a rien à faire dans
      // l'historique d'un visiteur anonyme — le bouton précédent le ramènerait
      // sur une page qui le redirigerait aussitôt.
      router.replace('/login')
    }
  }, [personal, status, router])

  return (
    <>
      {/* Le flux **demandé** : l'onglet actif est désigné par l'URL, jamais par
          la session. Sur `/`, « Global Feed » reste actif pour un lecteur
          connecté (REQ-WEB-009 AC-2). */}
      <FeedToggle feed={feed} />
      {personal && status !== 'authenticated' ? (
        <FeedStatus status={status} />
      ) : (
        <FeedList feed={feed} page={page} pathname={pathname} searchParams={searchParams} />
      )}
    </>
  )
}

/**
 * Écran d'attente de la résolution.
 *
 * Il porte `.feed-status` et **ni** `.article-preview` **ni**
 * `.empty-feed-message` : le contrat compte la première pour compter les
 * articles, et attend la seconde comme une liste effectivement vide. Un écran
 * transitoire qui porterait l'une ou l'autre serait décompté comme un résultat.
 */
function FeedStatus({ status }: { readonly status: SessionStatus }) {
  if (status === 'unavailable') {
    // Ni redirection ni appel authentifié : on dit l'indisponibilité, la session
    // retente d'elle-même (REQ-WEB-016).
    return <div className="feed-status">Your feed is unavailable while we reach the server.</div>
  }

  return <div className="feed-status">Loading articles...</div>
}
