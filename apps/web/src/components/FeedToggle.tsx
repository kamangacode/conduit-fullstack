'use client'

import Link from 'next/link'
import type { FeedKind } from '../lib/feed-query'
import { useSession } from '../lib/session'

/**
 * Bascule entre les flux (REQ-WEB-009), markup RealWorld (rule 11).
 *
 * Composant **client** : la présence de l'onglet « Your Feed » dépend
 * entièrement de la session, que le serveur ne connaît pas (ADR 012). Il paie
 * donc le même état transitoire que la barre de navigation — les onglets
 * anonymes s'affichent brièvement avant que le personnel n'apparaisse.
 *
 * L'onglet du tag **s'ajoute** aux deux autres au lieu de les remplacer : le
 * template de référence procède ainsi, et c'est ce qui permet au lecteur de
 * revenir au flux d'un seul clic plutôt que par le bouton précédent.
 */

export interface FeedToggleProps {
  readonly feed: FeedKind
}

interface Tab {
  readonly href: string
  readonly label: string
  readonly active: boolean
}

export function FeedToggle({ feed }: FeedToggleProps) {
  const { user } = useSession()

  const tabs: Tab[] = []

  if (user) {
    tabs.push({
      href: '/?feed=following',
      label: 'Your Feed',
      active: feed.kind === 'following',
    })
  }

  tabs.push({ href: '/', label: 'Global Feed', active: feed.kind === 'global' })

  if (feed.kind === 'tag') {
    // Toujours actif : on n'affiche cet onglet que lorsqu'on est dessus. Le
    // template de référence le fait apparaître au clic sur un tag populaire et
    // le retire en quittant.
    tabs.push({ href: `/tag/${feed.tag}`, label: feed.tag, active: true })
  }

  return (
    <div className="feed-toggle">
      <ul className="nav nav-pills outline-active">
        {tabs.map((tab) => (
          <li className="nav-item" key={tab.href}>
            <Link className={`nav-link${tab.active ? ' active' : ''}`} href={tab.href}>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
