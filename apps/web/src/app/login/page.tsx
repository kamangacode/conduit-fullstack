'use client'

import type { LoginDto, RegisterDto } from '@repo/shared'
import { AuthForm } from '../../components/AuthForm'
import { useApi } from '../../lib/api-provider'
import { useSession } from '../../lib/session'

/**
 * Page de connexion (REQ-WEB-003, route `/login`).
 *
 * Client Component : elle **écrit** la session (ADR 012).
 *
 * La page ne contient que le câblage — appeler l'API, ouvrir la session. La
 * saisie, la validation et l'affichage des erreurs appartiennent à `AuthForm`,
 * qui est le même sur les deux pages.
 */
export default function LoginPage() {
  const api = useApi()
  const { signIn } = useSession()

  async function submit(credentials: LoginDto | RegisterDto) {
    // Le cast est sûr par construction : `AuthForm` en mode `login` valide avec
    // `loginDtoSchema` et ne peut donc produire qu'un `LoginDto`.
    const user = await api.login(credentials as LoginDto)
    signIn(user)
  }

  return <AuthForm mode="login" onSubmit={submit} />
}
