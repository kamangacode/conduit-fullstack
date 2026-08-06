'use client'

import { type Comment, createCommentDtoSchema } from '@repo/shared'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { useApi } from '../lib/api-provider'
import { avatarUrl } from '../lib/avatar'
import { toMessages } from '../lib/errors'
import { formatDate } from '../lib/format-date'
import { useSession } from '../lib/session'
import { ErrorMessages } from './ErrorMessages'

/**
 * Commentaires d'un article (REQ-WEB-013), markup RealWorld (rule 11).
 *
 * Composant **client** : la liste évolue sans quitter la page, et ce que chaque
 * lecteur peut y faire dépend de lui (ADR 012).
 *
 * Le point à ne pas confondre : la commande de suppression appartient à
 * l'auteur **du commentaire**, pas à celui de l'article. Réutiliser le contrôle
 * de la page donnerait à l'auteur d'un article le droit apparent de supprimer
 * les commentaires d'autrui — que l'API refuserait, produisant une interface
 * qui promet ce qu'elle ne peut pas tenir.
 */

export interface CommentSectionProps {
  readonly slug: string
  /** Commentaires déjà chargés côté serveur — la section démarre remplie. */
  readonly initialComments: readonly Comment[]
}

export function CommentSection({ slug, initialComments }: CommentSectionProps) {
  const { user } = useSession()
  const [comments, setComments] = useState<readonly Comment[]>(initialComments)

  return (
    <div className="row">
      <div className="col-xs-12 col-md-8 offset-md-2">
        {user ? (
          <CommentForm
            slug={slug}
            authorImage={user.image}
            onPosted={(comment) => setComments((current) => [comment, ...current])}
          />
        ) : (
          // Invite **sans lien** (REQ-WEB-013 AC-2, AC-8). Le contrat de
          // sélecteurs traite `a[href="/login"]` comme un singleton de page :
          // toutes ses assertions de visibilité sont strictes et la barre de
          // navigation porte déjà ce lien, à un endroit stable et testé
          // ailleurs. Deux affordances pour la même route rendaient donc le
          // locator ambigu, et la page article était la seule à en porter deux.
          //
          // Le geste honnête est de retirer le doublon, pas de le déguiser : un
          // `<button>` qui navigue vers `/login` ferait disparaître le match
          // sans rien changer au comportement — c'est réécrire l'assertion par
          // un autre chemin (ADR 018). La phrase reste, elle explique l'absence
          // de formulaire ; l'affordance vit dans la barre.
          <p>Sign in or sign up to add comments on this article.</p>
        )}

        {comments.map((comment) => (
          <CommentCard
            comment={comment}
            key={comment.id}
            slug={slug}
            canDelete={user?.username === comment.author.username}
            onDeleted={() =>
              setComments((current) => current.filter((other) => other.id !== comment.id))
            }
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Formulaire de publication.
 *
 * Il porte `card comment-form` et non `card` seul : le contrat de sélecteurs
 * compte les commentaires par `.card:not(.comment-form) .card-block`, donc un
 * formulaire sans cette classe serait décompté comme un commentaire — le même
 * mode d'échec que l'indicateur de chargement qui portait la classe des aperçus
 * d'article.
 */
/** Messages génériques propres au dépôt de commentaire (voir `lib/errors.ts`). */
const COMMENT_MESSAGES: Readonly<Record<number, string>> = {
  401: 'your session has expired, please sign in again',
  500: 'something went wrong, please try again',
}

function CommentForm({
  slug,
  authorImage,
  onPosted,
}: {
  slug: string
  authorImage: string | null
  onPosted(comment: Comment): void
}) {
  const api = useApi()
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors([])

    // La règle « un commentaire n'est pas vide » vit dans le schéma partagé et
    // est appliquée à l'identique par l'API. La réécrire ici ferait diverger les
    // deux au premier changement.
    const parsed = createCommentDtoSchema.safeParse({ body })
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => `comment ${issue.message}`))
      return
    }

    setPending(true)
    try {
      onPosted(await api.addComment(slug, parsed.data))
      setBody('')
    } catch (error) {
      // Traduction **partagée** (REQ-WEB-017 AC-4) : le message figé qui vivait
      // ici disait « unable to post this comment » quelle que soit la cause, y
      // compris quand l'API avait répondu et expliqué son refus. Il masquait
      // donc la seule information utile, et il divergeait de ce que les autres
      // formulaires affichent pour le même échec.
      setErrors(toMessages(error, COMMENT_MESSAGES))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <ErrorMessages messages={errors} />
      <form className="card comment-form" onSubmit={submit}>
        <div className="card-block">
          <textarea
            aria-label="Write a comment..."
            className="form-control"
            placeholder="Write a comment..."
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className="card-footer">
          {/* biome-ignore lint/performance/noImgElement: le contrat de sélecteurs E2E vise `img.comment-author-img` et l'URL est arbitraire — `next/image` exigerait de déclarer chaque hôte distant en configuration, ce qu'un avatar fourni par l'utilisateur rend impossible. */}
          <img className="comment-author-img" src={avatarUrl(authorImage)} alt="" />
          <button className="btn btn-sm btn-primary" type="submit" disabled={pending}>
            Post Comment
          </button>
        </div>
      </form>
    </>
  )
}

/**
 * Un commentaire.
 *
 * Le corps est inséré comme du **texte** : le template ne prévoit pas de rendu
 * Markdown ici, et React l'échappe donc par construction — la page article a
 * déjà sa surface de rendu balisé, inutile d'en ouvrir une seconde.
 */
function CommentCard({
  comment,
  slug,
  canDelete,
  onDeleted,
}: {
  comment: Comment
  slug: string
  canDelete: boolean
  onDeleted(): void
}) {
  const api = useApi()
  const [failed, setFailed] = useState(false)

  async function remove() {
    setFailed(false)
    try {
      await api.deleteComment(slug, comment.id)
      onDeleted()
    } catch {
      // Sans ce traitement, le commentaire resterait affiché et le lecteur
      // croirait l'avoir supprimé.
      setFailed(true)
    }
  }

  return (
    <div className="card">
      <div className="card-block">
        <p className="card-text">{comment.body}</p>
      </div>
      <div className="card-footer">
        <Link className="comment-author" href={`/profile/${comment.author.username}`}>
          {/* biome-ignore lint/performance/noImgElement: voir `CommentForm` — le contrat vise `img.comment-author-img` et l'URL est arbitraire. */}
          <img className="comment-author-img" src={avatarUrl(comment.author.image)} alt="" />
        </Link>{' '}
        <Link className="comment-author" href={`/profile/${comment.author.username}`}>
          {comment.author.username}
        </Link>
        <span className="date-posted">{formatDate(comment.createdAt)}</span>
        {canDelete && (
          <span className="mod-options">
            <button aria-label="Delete comment" type="button" onClick={remove}>
              <i className="ion-trash-a" />
            </button>
          </span>
        )}
        {failed && <ErrorMessages messages={['unable to delete this comment']} />}
      </div>
    </div>
  )
}
