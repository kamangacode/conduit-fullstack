import Link from 'next/link'

/**
 * Onglets d'un profil (REQ-WEB-015), markup RealWorld (rule 11).
 *
 * **Server Component** : l'onglet actif se déduit de l'URL seule, rien qui
 * dépende du lecteur (ADR 012). C'est la différence avec la bascule de flux de
 * l'accueil, dont l'onglet « Your Feed » n'existe que pour un connecté.
 */

export interface ArticlesToggleProps {
  readonly username: string
  readonly active: 'author' | 'favorited'
}

export function ArticlesToggle({ username, active }: ArticlesToggleProps) {
  const base = `/profile/${encodeURIComponent(username)}`

  const tabs = [
    { href: base, label: 'My Articles', key: 'author' as const },
    { href: `${base}/favorites`, label: 'Favorited Articles', key: 'favorited' as const },
  ]

  return (
    <div className="articles-toggle">
      <ul className="nav nav-pills outline-active">
        {tabs.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <Link className={`nav-link${tab.key === active ? ' active' : ''}`} href={tab.href}>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
