'use client'

import type { UpdateUserDto, User } from '@repo/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
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
  const { user, status, signIn, signOut } = useSession()

  /**
   * Dernier compte résolu sur cette page (AC-7).
   *
   * La session peut se fermer **pendant** l'édition : un 401 à l'enregistrement
   * la purge, comme REQ-WEB-002 AC-4 le demande. Sans cette copie, la page
   * repassait alors par la redirection ci-dessous et se vidait — l'utilisateur
   * voyait sa saisie disparaître sans jamais lire le message qui l'expliquait.
   */
  const [account, setAccount] = useState<User | null>(null)

  useEffect(() => {
    if (user) {
      setAccount(user)
    }
  }, [user])

  useEffect(() => {
    // On attend que la session soit **résolue**. Rediriger sur `user === null`
    // éjectait les utilisateurs connectés : les effets React se déclenchent des
    // enfants vers les parents, donc cet effet s'exécutait avant que
    // `SessionProvider` ait relu le stockage, et `user` y valait toujours
    // `null`. `status` lève l'ambiguïté que ce commentaire se contentait
    // auparavant de décrire.
    //
    // `!account` restreint la redirection à ceux qui **arrivent** sans session.
    // Celui dont la session expire sous les doigts reste sur sa page, avec son
    // message — le renvoyer à la connexion sans rien dire lui ferait croire à un
    // défaut de l'application (AC-7).
    if (status === 'anonymous' && !account) {
      router.push('/login')
    }
  }, [status, account, router])

  if (!account) {
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

  return <SettingsForm user={account} onSave={save} onSignOut={logout} />
}
