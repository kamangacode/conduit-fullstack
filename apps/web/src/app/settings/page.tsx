'use client'

import type { UpdateUserDto, User } from '@repo/shared'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SettingsForm } from '../../components/SettingsForm'
import type { ApiClient } from '../../lib/api-client'
import { useApi } from '../../lib/api-provider'
import { profileQueryKey } from '../../lib/content-query'
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
  const queryClient = useQueryClient()
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

  const save = (changes: UpdateUserDto) =>
    applyChanges(changes, { api, signIn, queryClient, router })

  function logout() {
    signOut()
    router.push('/')
  }

  return <SettingsForm user={account} onSave={save} onSignOut={logout} />
}

/** Ce dont l'enregistrement a besoin, hors du composant qui les fournit. */
interface SaveDeps {
  readonly api: ApiClient
  signIn(user: User): void
  readonly queryClient: QueryClient
  readonly router: { push(href: string): void }
}

/**
 * Enregistre, puis emmène l'utilisateur sur son profil (AC-8, AC-9, AC-10).
 *
 * Extraite du composant pour le garder sous la limite de lignes (rule 17), et
 * parce que la séquence « envoyer → rafraîchir la session → invalider le profil
 * → naviguer » se lit mieux d'un bloc que dispersée dans le corps de la page.
 *
 * **Aucune des trois étapes qui suivent l'envoi n'est atteinte si `updateUser`
 * rejette** : l'exception remonte à `SettingsForm`, qui affiche le message et
 * laisse la saisie en place. C'est ce qui satisfait AC-9 sans faire régresser
 * AC-7 — la navigation est conditionnée au succès par la **structure**, pas par
 * un `if` qu'un remaniement pourrait déplacer.
 */
async function applyChanges(changes: UpdateUserDto, deps: SaveDeps): Promise<void> {
  const updated = await deps.api.updateUser(changes)

  // La session est rafraîchie : le lien de profil de la navbar porte le
  // username, et l'oublier afficherait l'ancien jusqu'au rechargement — un
  // décalage que l'utilisateur attribue à un échec de l'enregistrement.
  deps.signIn(updated)

  // Le profil vit dans le cache de requêtes avec `staleTime: 30s` (AC-10).
  // Sans invalidation, l'utilisateur qui enregistre deux fois de suite —
  // renseigner une bio, puis l'effacer — arriverait sur son profil et y lirait
  // la valeur précédente : une entrée encore fraîche est servie sans requête.
  // Le symptôme se lit comme un enregistrement perdu.
  await deps.queryClient.invalidateQueries({ queryKey: profileQueryKey(updated.username) })

  // Le username **de la réponse**, jamais celui de l'état initial : celui qui
  // vient de se renommer serait envoyé vers une page qui n'existe plus.
  // `encodeURIComponent` parce que le segment vient d'une saisie libre.
  deps.router.push(`/profile/${encodeURIComponent(updated.username)}`)
}
