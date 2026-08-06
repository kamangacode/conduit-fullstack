'use client'

import type { ArticleSummary } from '@repo/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApi } from '../lib/api-provider'
import { avatarUrl } from '../lib/avatar'
import { formatDate } from '../lib/format-date'
import { useSession } from '../lib/session'

/**
 * Aperçu d'article dans une liste (REQ-WEB-011), markup RealWorld (rule 11).
 *
 * C'est le composant le plus **répété** de l'application : accueil, page d'un
 * tag, et les deux onglets du profil l'affichent. La frontière de l'ADR 012 y
 * passe donc *à l'intérieur* d'un élément de liste — le contenu est public et
 * pourrait être rendu côté serveur, le bouton de favori dépend du lecteur
 * (règle R-5). Le composant est client dans son entier : scinder l'aperçu en
 * deux pour rendre la carte côté serveur et le seul bouton côté client
 * coûterait une frontière de plus par article, pour un gain nul sur une carte
 * qui tient en quelques nœuds.
 *
 * Il consomme la forme **sans corps** (`ArticleSummary`, règle R-7) : attendre
 * `body` ici afficherait `undefined` sur une page pourtant complète.
 */

export interface ArticlePreviewProps {
  readonly article: ArticleSummary
}

/** Ce qu'une bascule de favori vient de changer, en attendant la liste à jour. */
interface FavoriteOverride {
  readonly slug: string
  readonly favorited: boolean
  readonly favoritesCount: number
}

export function ArticlePreview({ article }: ArticlePreviewProps) {
  // L'état de favori **dérive des props**, avec un écart local qui ne survit
  // qu'à la mutation qui l'a produit.
  //
  // La version précédente copiait `article.favorited` dans un `useState` : elle
  // ne se resynchronisait donc jamais quand la liste était rechargée avec des
  // valeurs fraîches (un autre lecteur ayant favorisé entre-temps). Le
  // `key={article.slug}` de la liste protège du changement de *liste*, pas du
  // rafraîchissement de la *même* liste. Le remède est celui déjà appliqué au
  // bouton de suivi : ne garder en local que ce que le serveur ne sait pas
  // encore, et laisser les props gouverner le reste.
  //
  // L'écart porte le slug pour être invalidé si le composant est réutilisé pour
  // un autre article sans démontage.
  const [override, setOverride] = useState<FavoriteOverride | null>(null)
  const applied = override?.slug === article.slug ? override : null
  const favorited = applied?.favorited ?? article.favorited
  const favoritesCount = applied?.favoritesCount ?? article.favoritesCount

  return (
    <div className="article-preview">
      <div className="article-meta">
        <Link href={`/profile/${article.author.username}`}>
          {/* biome-ignore lint/performance/noImgElement: le contrat de sélecteurs E2E vise l'image de `.article-meta` (REQ-WEB-007 AC-3) et l'URL est arbitraire — `next/image` exigerait de déclarer chaque hôte distant en configuration, ce qu'un avatar fourni par l'utilisateur rend impossible. */}
          <img src={avatarUrl(article.author.image)} alt="" />
        </Link>
        <div className="info">
          <Link className="author" href={`/profile/${article.author.username}`}>
            {article.author.username}
          </Link>
          <span className="date">{formatDate(article.createdAt)}</span>
        </div>
        <FavoriteButton
          slug={article.slug}
          favorited={favorited}
          favoritesCount={favoritesCount}
          onToggled={(next) => setOverride({ slug: article.slug, ...next })}
        />
      </div>
      <Link className="preview-link" href={`/article/${article.slug}`}>
        <h1>{article.title}</h1>
        <p>{article.description}</p>
        <span>Read more...</span>
        <ul className="tag-list">
          {article.tagList.map((tag) => (
            <li className="tag-default tag-pill tag-outline" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      </Link>
    </div>
  )
}

interface FavoriteButtonProps {
  readonly slug: string
  readonly favorited: boolean
  readonly favoritesCount: number
  onToggled(next: { favorited: boolean; favoritesCount: number }): void
}

/**
 * Bascule de favori (REQ-WEB-011 AC-2 à AC-6).
 *
 * Deux partis pris tenus par des tests :
 *
 * 1. **L'état vient de la réponse**, jamais d'un incrément local. Une bascule
 *    optimiste est le réflexe naturel et produit une dérive silencieuse : au
 *    premier échec, l'affichage et la base cessent de dire la même chose et
 *    rien ne les resynchronise avant un rechargement.
 * 2. **La classe porte l'état** — `btn-outline-primary` non favorisé,
 *    `btn-primary` favorisé. Ce n'est pas cosmétique : c'est ainsi que le
 *    contrat de sélecteurs E2E *définit* l'état, donc les inverser produirait
 *    une interface qui a l'air juste et une suite de tests qui affirme le
 *    contraire de la réalité.
 */
function FavoriteButton({ slug, favorited, favoritesCount, onToggled }: FavoriteButtonProps) {
  const api = useApi()
  const router = useRouter()
  const { user, status } = useSession()
  const [pending, setPending] = useState(false)

  async function toggle() {
    // Anonyme : on conduit à la connexion plutôt que de laisser partir un appel
    // qui reviendrait en 401 (AC-5).
    if (!user) {
      router.push('/login')
      return
    }

    setPending(true)
    try {
      const updated = favorited
        ? await api.unfavoriteArticle(slug)
        : await api.favoriteArticle(slug)
      onToggled(updated)
    } catch {
      // L'échec laisse l'état inchangé (AC-6). Sans ce `catch`, le rejet
      // remonterait non traité et le compteur afficherait une valeur que
      // l'API n'a jamais confirmée.
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      className={`btn btn-sm pull-xs-right ${favorited ? 'btn-primary' : 'btn-outline-primary'}`}
      type="button"
      onClick={toggle}
      // Désactivé tant que la session n'est pas résolue : cliquer pendant la
      // réhydratation prendrait le lecteur pour un anonyme et l'enverrait à la
      // connexion alors qu'il a une session valide.
      disabled={pending || status === 'pending'}
    >
      <i className="ion-heart" /> {favoritesCount}
    </button>
  )
}
