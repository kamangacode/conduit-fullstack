'use client'

import type { UpdateUserDto, User } from '@repo/shared'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { SettingsForm } from '../../components/SettingsForm'
import type { ApiClient } from '../../lib/api-client'
import { useApi } from '../../lib/api-provider'
import { useAuthenticatedAccount } from '../../lib/authenticated-page'
import { invalidateAuthorCaches } from '../../lib/content-query'
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
 *
 * Cette règle — et la nuance qui la rend juste, « arriver anonyme » n'est pas
 * « le devenir en cours d'édition » (AC-7) — vivait **ici**, dans cette page,
 * et nulle part ailleurs. L'éditeur d'article avait donc le défaut qu'AC-7
 * fermait. Elle a été extraite telle quelle dans `useAuthenticatedAccount`
 * (REQ-WEB-019 AC-4) : le comportement de cette page est inchangé, ses tests
 * en font foi.
 */
export default function SettingsPage() {
  const api = useApi()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { signIn, signOut } = useSession()
  const account = useAuthenticatedAccount()

  if (!account) {
    return null
  }

  const save = (changes: UpdateUserDto) =>
    applyChanges(changes, { api, signIn, queryClient, router, previousUsername: account.username })

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
  /**
   * Username **avant** l'enregistrement — capturé par la page, qui seule le
   * connaît. Sans lui, `applyChanges` ne peut invalider que la clé du nouveau
   * username (AC-10 côté "bio changée sans renommage"), pas celle de l'ancien.
   */
  readonly previousUsername: string
}

/**
 * Enregistre, puis emmène l'utilisateur sur son profil (AC-8, AC-9, AC-10).
 *
 * Extraite du composant pour le garder sous la limite de lignes (rule 17), et
 * parce que la séquence « envoyer → en tirer les conséquences » se lit mieux
 * d'un bloc que dispersée dans le corps de la page.
 *
 * **Rien de ce qui suit l'envoi n'est atteint si `updateUser` rejette** :
 * l'exception remonte à `SettingsForm`, qui affiche le message et laisse la
 * saisie en place. C'est ce qui satisfait AC-9 sans faire régresser AC-7 — la
 * navigation est conditionnée au succès par la **structure**, pas par un `if`
 * qu'un remaniement pourrait déplacer.
 */
async function applyChanges(changes: UpdateUserDto, deps: SaveDeps): Promise<void> {
  const updated = await deps.api.updateUser(changes)

  afterSaved(updated, deps)
}

/**
 * Les suites d'un enregistrement **déjà réussi**.
 *
 * Elles sont séparées de l'envoi parce qu'elles n'en partagent pas le sens de
 * l'échec. Passé l'`await`, le compte est à jour côté serveur ; une exception
 * levée ici n'est donc pas un enregistrement raté. Or `SettingsForm` traite tout
 * ce qui remonte de `save()` comme tel, et `toMessages` ne reconnaissant pas ces
 * erreurs-là comme des `ApiError`, l'utilisateur lisait « Unable to connect to
 * the server, please try again » sur une sauvegarde parfaitement enregistrée —
 * et était invité à la refaire. Le cas n'est pas théorique : `signIn` écrit dans
 * `localStorage`, qui lève en navigation privée ou sur quota dépassé.
 *
 * L'erreur est **journalisée** plutôt qu'avalée : sans trace, le prochain à
 * chercher pourquoi la session ne suit pas n'aurait ni pile ni message.
 */
function afterSaved(updated: User, deps: SaveDeps): void {
  try {
    // La session est rafraîchie : le lien de profil de la navbar porte le
    // username, et l'oublier afficherait l'ancien jusqu'au rechargement — un
    // décalage que l'utilisateur attribue à un échec de l'enregistrement.
    deps.signIn(updated)

    // La politique de fraîcheur du cache — quelles clés un compte modifié rend
    // périmées — vit à côté des clés elles-mêmes (`content-query.ts`), pas ici :
    // voir `invalidateAuthorCaches`. Elle couvre le profil (AC-10) et les copies
    // dénormalisées de l'auteur (méta d'article, flux, commentaires), sur
    // l'ancien username comme sur le nouveau en cas de renommage.
    //
    // Délibérément non attendue : la navigation ne doit pas dépendre d'un
    // rafraîchissement de cache en arrière-plan, potentiellement lent ou sans
    // fin (voir le commentaire de la fonction).
    invalidateAuthorCaches(deps.queryClient, [deps.previousUsername, updated.username])
  } catch (error) {
    console.error('Suites locales d’un enregistrement de compte réussi', error)
  } finally {
    // Dans un `finally` : AC-8 fait atterrir sur le profil, et un stockage local
    // qui refuse une écriture ne doit pas laisser l'utilisateur devant un
    // formulaire muet après une sauvegarde réussie.
    //
    // Le username **de la réponse**, jamais celui de l'état initial : celui qui
    // vient de se renommer serait envoyé vers une page qui n'existe plus.
    // `encodeURIComponent` parce que le segment vient d'une saisie libre, et
    // parce que les routes `/profile/:username` ne le décodent plus qu'une fois
    // — la leur, automatique (voir leur commentaire).
    deps.router.push(`/profile/${encodeURIComponent(updated.username)}`)
  }
}
