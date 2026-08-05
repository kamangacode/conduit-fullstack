'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '../lib/session'

/**
 * Barre de navigation (REQ-WEB-006), markup RealWorld (rule 11).
 *
 * Composant **client** : son contenu dépend entièrement de la session. C'est
 * donc lui qui paie le plus visiblement le coût assumé par l'ADR 012 — les
 * liens anonymes s'affichent brièvement avant de basculer.
 *
 * Ce bref décalage n'est pas un défaut à masquer : le masquer supposerait de
 * connaître la session côté serveur, c'est-à-dire le cookie que l'ADR écarte.
 * Ce qu'il faut en revanche éviter, c'est la **divergence d'hydratation** — le
 * serveur et le premier rendu client produisent tous deux la version anonyme,
 * puisque `useSession` ne lit le stockage qu'après montage.
 */

interface NavLink {
  readonly href: string
  readonly label: string
}

const ANONYMOUS_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/login', label: 'Sign in' },
  { href: '/register', label: 'Sign up' },
]

export function Navbar() {
  const { user } = useSession()
  const pathname = usePathname()

  const links: readonly NavLink[] = user
    ? [
        { href: '/', label: 'Home' },
        { href: '/editor', label: 'New Article' },
        { href: '/settings', label: 'Settings' },
        { href: `/profile/${user.username}`, label: user.username },
      ]
    : ANONYMOUS_LINKS

  return (
    <nav className="navbar navbar-light">
      <div className="container">
        <Link className="navbar-brand" href="/">
          conduit
        </Link>
        <ul className="nav navbar-nav pull-xs-right">
          {links.map((link) => (
            <li className="nav-item" key={link.href}>
              {/* `active` sur le lien courant : le CSS de référence s'en sert
                  pour marquer la page, et l'omettre passerait inaperçu en
                  développement tout en rendant la navigation illisible. */}
              <Link
                className={`nav-link${pathname === link.href ? ' active' : ''}`}
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
