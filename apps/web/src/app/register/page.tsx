'use client'

import type { LoginDto, RegisterDto } from '@repo/shared'
import { AuthForm } from '../../components/AuthForm'
import { useApi } from '../../lib/api-provider'
import { useSession } from '../../lib/session'

/**
 * Page d'inscription (REQ-WEB-003, route `/register`).
 *
 * L'inscription **ouvre la session** directement : l'API renvoie un `User`
 * porteur d'un jeton exploitable (REQ-USER-002). Enchaîner une connexion après
 * l'inscription obligerait le front à deux appels pour un seul geste
 * utilisateur, et laisserait une fenêtre où le compte existe sans session.
 */
export default function RegisterPage() {
  const api = useApi()
  const { signIn } = useSession()

  async function submit(credentials: LoginDto | RegisterDto) {
    // Sûr par construction : en mode `register`, `AuthForm` valide avec
    // `registerDtoSchema` et ne peut produire qu'un `RegisterDto`.
    const user = await api.register(credentials as RegisterDto)
    signIn(user)
  }

  return <AuthForm mode="register" onSubmit={submit} />
}
