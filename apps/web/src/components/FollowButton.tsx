'use client'

import type { Profile } from '@repo/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApi } from '../lib/api-provider'
import { useSession } from '../lib/session'

/**
 * Bouton de suivi (REQ-WEB-005), markup RealWorld (rule 11).
 *
 * C'est le **fragment client** d'une page rendue côté serveur : le profil est
 * public et arrive déjà rendu, seul `following` dépend du lecteur (R-5) et doit
 * donc être résolu ici. C'est la frontière de l'ADR 012 dans sa forme la plus
 * concrète.
 *
 * L'état initial vient du serveur, où l'appel est anonyme : `following` y vaut
 * toujours `false`. Après hydratation, le composant reflète la relation réelle
 * du lecteur — et c'est pourquoi il ne peut pas se contenter de la prop.
 */

export interface FollowButtonProps {
  readonly profile: Profile
}

export function FollowButton({ profile }: FollowButtonProps) {
  const api = useApi()
  const router = useRouter()
  const { user } = useSession()
  const [following, setFollowing] = useState(profile.following)
  const [pending, setPending] = useState(false)

  // Son propre profil : le contrat n'interdit pas l'auto-suivi
  // (REQ-PROFILE-003), donc l'interface est le seul endroit où l'éviter. Le
  // front de référence propose ici le lien vers les paramètres.
  if (user?.username === profile.username) {
    return (
      <Link className="btn btn-sm btn-outline-secondary action-btn" href="/settings">
        <i className="ion-gear-a" /> Edit Profile Settings
      </Link>
    )
  }

  async function toggle() {
    // Anonyme : on conduit à la connexion plutôt que de laisser partir un appel
    // qui reviendrait en 401 (REQ-WEB-005 AC-2).
    if (!user) {
      router.push('/login')
      return
    }

    setPending(true)
    try {
      const updated = following
        ? await api.unfollowUser(profile.username)
        : await api.followUser(profile.username)
      // L'état vient de la réponse, pas d'une bascule locale : c'est l'API qui
      // fait foi, et une bascule optimiste divergerait au premier échec.
      setFollowing(updated.following)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      className={`btn btn-sm action-btn ${following ? 'btn-secondary' : 'btn-outline-secondary'}`}
      type="button"
      onClick={toggle}
      disabled={pending}
    >
      <i className="ion-plus-round" /> {following ? 'Unfollow' : 'Follow'} {profile.username}
    </button>
  )
}
