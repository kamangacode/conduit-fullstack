'use client'

import type { Article } from '@repo/shared'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApi } from '../lib/api-provider'
import { avatarUrl } from '../lib/avatar'
import { articleQueryKey } from '../lib/content-query'
import { formatDate } from '../lib/format-date'
import { useSession } from '../lib/session'
import { ErrorMessages } from './ErrorMessages'
import { FavoriteButton } from './FavoriteButton'
import { FollowButton } from './FollowButton'

/**
 * Méta d'article : auteur, date, et les actions offertes au lecteur
 * (REQ-WEB-012 AC-1/AC-4/AC-5/AC-6), markup RealWorld (rule 11).
 *
 * Le template la place **deux fois** sur la page — sous le titre et après le
 * corps. C'est la raison d'être de ce composant : deux copies du même bloc
 * divergeraient au premier changement, et l'une des deux garderait un bouton que
 * l'autre aurait perdu.
 *
 * Les actions dépendent du lecteur (règle R-5), donc le composant est client
 * (ADR 012). **Masquer un bouton n'est pas une sécurité** : l'API refuse déjà la
 * suppression par un tiers (REQ-ARTICLE-006). Ce qui se joue ici est la qualité
 * de l'interface — proposer une action vouée à échouer est un défaut d'affichage,
 * l'autoriser serait un défaut de sécurité, et les deux se traitent ailleurs
 * l'un de l'autre.
 */

export interface ArticleMetaProps {
  readonly article: Article
}

export function ArticleMeta({ article }: ArticleMetaProps) {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const isAuthor = user?.username === article.author.username

  return (
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

      {isAuthor ? (
        <AuthorActions slug={article.slug} />
      ) : (
        // Suivre l'auteur et favoriser l'article : deux gestes relatifs au
        // lecteur, sans objet sur son propre article. Le second manquait — le
        // gabarit RealWorld et le contrat de sélecteurs l'attendent tous deux
        // sur cette page, et aucun de nos tests ne le réclamait.
        <>
          <FollowButton profile={article.author} />{' '}
          <FavoriteButton
            slug={article.slug}
            favorited={article.favorited}
            favoritesCount={article.favoritesCount}
            variant="labelled"
            onToggled={(next) => {
              // La réponse de l'API est écrite dans le **cache partagé**, pas
              // dans un état local : la méta est rendue deux fois sur la page
              // (bandeau et bas d'article), et un état local ne mettrait à jour
              // que celle sur laquelle on a cliqué — l'autre afficherait un
              // compteur périmé jusqu'au rechargement.
              queryClient.setQueryData(articleQueryKey(article.slug), {
                ...article,
                ...next,
              })
            }}
          />
        </>
      )}
    </div>
  )
}

/**
 * Modifier et supprimer — proposés au seul auteur (AC-5).
 *
 * Les libellés viennent du contrat de sélecteurs E2E (`Edit Article`,
 * `Delete Article`) : les reformuler casserait la suite partagée sans rien
 * casser à l'écran.
 */
function AuthorActions({ slug }: { slug: string }) {
  const api = useApi()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function remove() {
    setPending(true)
    setFailed(false)
    try {
      await api.deleteArticle(slug)
      // L'article n'existe plus : rester sur sa page afficherait une ressource
      // qu'un rechargement rendrait introuvable (AC-6).
      router.push('/')
    } catch {
      // Sans ce `catch`, l'échec devenait un rejet non traité : le bouton se
      // réactivait, rien ne bougeait, et l'auteur croyait avoir supprimé.
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Link className="btn btn-sm btn-outline-secondary" href={`/editor/${slug}`}>
        <i className="ion-edit" /> Edit Article
      </Link>{' '}
      <button
        className="btn btn-sm btn-outline-danger"
        type="button"
        onClick={remove}
        disabled={pending}
      >
        <i className="ion-trash-a" /> Delete Article
      </button>
      {failed && <ErrorMessages messages={['unable to delete this article']} />}
    </>
  )
}
