'use client'

import type { Profile } from '@repo/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApi } from '../lib/api-provider'
import { useSession } from '../lib/session'
import { ErrorMessages } from './ErrorMessages'

/**
 * Bouton de suivi (REQ-WEB-005), markup RealWorld (rule 11).
 *
 * `following` est la seule donnée du profil qui dépende du lecteur (règle R-5) :
 * c'est la frontière de l'ADR 012 dans sa forme la plus concrète.
 *
 * La prop **fait foi**. Depuis l'[ADR 020] elle ne vient plus d'un rendu serveur
 * anonyme mais de la requête cliente de `ProfileView` ou d'`ArticleView`, toutes
 * deux émises une fois la session résolue (AC-7) : la valeur reçue est donc
 * déjà celle du lecteur, et la recopier dans un état local ne ferait que la
 * figer.
 */

export interface FollowButtonProps {
  readonly profile: Profile
}

/**
 * L'écart qu'une bascule vient de produire, en attendant que la prop rattrape.
 *
 * Il porte le username **et** la valeur que la prop affichait au moment du clic.
 * Les deux servent à l'invalider : le premier quand le composant est réutilisé
 * pour un autre profil sans démontage, le second dès que le serveur a parlé.
 */
interface FollowOverride {
  readonly username: string
  /** Valeur portée par la prop à l'instant du clic. */
  readonly from: boolean
  /** Valeur renvoyée par l'API. */
  readonly to: boolean
}

/**
 * État de suivi **dérivé de la prop**, avec un écart local qui ne survit qu'à la
 * bascule qui l'a produit (AC-9).
 *
 * La version précédente copiait `profile.following` dans un `useState` et ne se
 * resynchronisait que sur un **changement de username**. Une réponse fraîche
 * pour le *même* profil, portant un `following` différent, était donc
 * silencieusement ignorée : le cas exact du lecteur qui recharge son profil
 * cible après avoir suivi depuis un autre onglet — ou, avant AC-7, à chaque
 * chargement de page.
 *
 * C'est le motif déjà appliqué à `ArticlePreview` : ne garder en local que ce
 * que le serveur ne sait pas encore, et laisser les props gouverner le reste.
 * Le commentaire de ce fichier voisin l'affirmait déjà de ce bouton-ci ; il
 * n'était pas vrai, il l'est maintenant.
 */
function useFollowState(profile: Profile): [boolean, (next: boolean) => void] {
  const [override, setOverride] = useState<FollowOverride | null>(null)

  // `from !== profile.following` signifie que la prop a bougé depuis le clic :
  // le serveur a donc répondu, et l'écart local n'a plus rien à dire.
  const applied =
    override?.username === profile.username && override.from === profile.following ? override : null

  const setFollowing = (next: boolean) =>
    setOverride({ username: profile.username, from: profile.following, to: next })

  return [applied?.to ?? profile.following, setFollowing]
}

/** Ce que le front de référence affiche à la place du bouton, sur son propre profil. */
function EditProfileLink() {
  return (
    <Link className="btn btn-sm btn-outline-secondary action-btn" href="/settings">
      <i className="ion-gear-a" /> Edit Profile Settings
    </Link>
  )
}

export function FollowButton({ profile }: FollowButtonProps) {
  const api = useApi()
  const router = useRouter()
  const { user } = useSession()
  const [following, setFollowing] = useFollowState(profile)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  // Son propre profil : le contrat n'interdit pas l'auto-suivi
  // (REQ-PROFILE-003), donc l'interface est le seul endroit où l'éviter. Le
  // front de référence propose ici le lien vers les paramètres.
  if (user?.username === profile.username) {
    return <EditProfileLink />
  }

  async function toggle() {
    // Anonyme : on conduit à la connexion plutôt que de laisser partir un appel
    // qui reviendrait en 401 (REQ-WEB-005 AC-2).
    if (!user) {
      router.push('/login')
      return
    }

    setPending(true)
    setFailed(false)
    try {
      const updated = following
        ? await api.unfollowUser(profile.username)
        : await api.followUser(profile.username)
      // L'état vient de la réponse, pas d'une bascule locale : c'est l'API qui
      // fait foi, et une bascule optimiste divergerait au premier échec.
      setFollowing(updated.following)
    } catch {
      // Sans ce `catch`, l'échec devenait un rejet non traité : le bouton se
      // réactivait, l'état ne changeait pas, et le lecteur n'avait aucun moyen
      // de savoir que son clic n'avait rien fait.
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        className={`btn btn-sm action-btn ${following ? 'btn-secondary' : 'btn-outline-secondary'}`}
        type="button"
        onClick={toggle}
        disabled={pending}
      >
        <i className="ion-plus-round" /> {following ? 'Unfollow' : 'Follow'} {profile.username}
      </button>
      {failed && <ErrorMessages messages={['unable to update the follow status']} />}
    </>
  )
}
