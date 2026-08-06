'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { avatarUrl } from '../lib/avatar'
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
  /**
   * Classe d'icône Ionicons v2 du template (REQ-WEB-007 AC-8).
   *
   * Les icônes ne sont pas une décoration ajoutée après coup : `templates.md`
   * les place dans le DOM de la barre authentifiée, et la feuille de style de
   * référence les dimensionne. Les omettre laisse des libellés nus, décalés par
   * rapport au reste du thème.
   */
  readonly icon?: string
  /** Avatar affiché avant le libellé — seul le lien de profil en porte un. */
  readonly avatar?: string
}

const ANONYMOUS_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/login', label: 'Sign in' },
  { href: '/register', label: 'Sign up' },
]

/**
 * Barre du mode indisponible (REQ-WEB-016 AC-4).
 *
 * **Seul l'accueil**, et surtout pas « Sign in » : proposer de se reconnecter
 * revient à affirmer que la session a expiré, alors que le jeton est conservé et
 * qu'on ne sait justement pas ce qu'il vaut. L'utilisateur suivrait le conseil,
 * et le formulaire échouerait pour la même raison que la vérification.
 *
 * Les liens du compte sont tout aussi exclus : ils supposent un compte résolu,
 * et `/settings` ou `/editor` n'ont rien à afficher sans lui.
 */
const UNAVAILABLE_LINKS: readonly NavLink[] = [{ href: '/', label: 'Home' }]

/** Libellé de l'indicateur. Le contrat e2e cherche le mot « Connecting ». */
const RECONNECTING_LABEL = 'Connecting…'

export function Navbar() {
  const { user, status } = useSession()
  const pathname = usePathname()

  const links: readonly NavLink[] = user
    ? [
        { href: '/', label: 'Home' },
        { href: '/editor', label: 'New Article', icon: 'ion-compose' },
        { href: '/settings', label: 'Settings', icon: 'ion-gear-a' },
        {
          href: `/profile/${user.username}`,
          label: user.username,
          avatar: avatarUrl(user.image),
        },
      ]
    : status === 'unavailable'
      ? UNAVAILABLE_LINKS
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
                {/* Le séparateur est **explicite**, et il doit l'être : deux
                    expressions JSX que seul un saut de ligne sépare se
                    concatènent sans espace, là où le gabarit HTML écrit
                    `<i class="ion-compose"></i>&nbsp;New Article` et où le saut
                    de ligne du source se réduirait à une espace au rendu. Rien
                    ne rattraperait l'oubli côté style : `styles.css` donne un
                    `margin-right` à `.nav-link .user-pic`, mais rien à
                    `.nav-link i`. L'espace insécable reprend celle du gabarit. */}
                {link.icon && (
                  <>
                    <i className={link.icon} />
                    {' '}
                  </>
                )}
                {link.avatar && (
                  <>
                    {/* biome-ignore lint/performance/noImgElement: le contrat de sélecteurs E2E vise `img.user-pic` (REQ-WEB-007 AC-8) et l'URL est arbitraire — `next/image` exigerait de déclarer chaque hôte distant en configuration, ce qu'un avatar fourni par l'utilisateur rend impossible. */}
                    <img className="user-pic" src={link.avatar} alt="" />{' '}
                  </>
                )}
                {link.label}
              </Link>
            </li>
          ))}
          {/* L'indicateur vit **dans** la barre, pas dans une bannière à part :
              c'est là que l'utilisateur cherche son identité, donc là que son
              absence l'interroge. `role="status"` en fait une région annoncée
              par les lecteurs d'écran quand elle apparaît — l'information est
              exactement du type que ce rôle décrit, et elle serait autrement
              invisible pour eux. */}
          {status === 'unavailable' && (
            <li className="nav-item">
              <span className="nav-link" role="status">
                {RECONNECTING_LABEL}
              </span>
            </li>
          )}
        </ul>
      </div>
    </nav>
  )
}
