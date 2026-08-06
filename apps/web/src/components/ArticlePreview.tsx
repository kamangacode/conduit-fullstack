'use client'

import type { ArticleSummary } from '@repo/shared'
import Link from 'next/link'
import { useState } from 'react'
import { avatarUrl } from '../lib/avatar'
import { formatDate } from '../lib/format-date'
import { FavoriteButton } from './FavoriteButton'

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
