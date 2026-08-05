'use client'

import type { UpdateUserDto } from '@repo/shared'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SettingsForm } from '../../components/SettingsForm'
import { useApi } from '../../lib/api-provider'
import { useSession } from '../../lib/session'

/**
 * Page de paramètres (REQ-WEB-004, route `/settings`).
 *
 * Entièrement personnelle : rien n'y est affichable pour un anonyme, ce qui en
 * fait un Client Component sans nuance (ADR 012).
 *
 * La redirection a lieu **dans un effet** et non pendant le rendu : la session
 * n'est connue qu'après montage (REQ-WEB-002 AC-5), donc rediriger au premier
 * rendu enverrait tout le monde vers la connexion, y compris les utilisateurs
 * connectés. Le rendu `null` transitoire est le prix de cette contrainte.
 */
export default function SettingsPage() {
  const api = useApi()
  const router = useRouter()
  const { user, signIn, signOut } = useSession()

  useEffect(() => {
    // `user === null` couvre deux états que le rendu ne distingue pas : « pas
    // encore réhydraté » et « anonyme ». On ne peut donc pas rediriger avant
    // que la session ait été lue — d'où l'effet, qui s'exécute après.
    if (user === null) {
      router.push('/login')
    }
  }, [user, router])

  if (!user) {
    return null
  }

  async function save(changes: UpdateUserDto) {
    const updated = await api.updateUser(changes)
    // La session est rafraîchie : le lien de profil de la navbar porte le
    // username, et l'oublier afficherait l'ancien jusqu'au rechargement — un
    // décalage que l'utilisateur attribue à un échec de l'enregistrement.
    signIn(updated)
  }

  function logout() {
    signOut()
    router.push('/')
  }

  return <SettingsForm user={user} onSave={save} onSignOut={logout} />
}
