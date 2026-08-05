import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api-client'
import { SESSION_STORAGE_KEY, SessionProvider, useSession } from './session'

/**
 * Couvre ce que la revue de F4 a trouvé non couvert :
 *
 * - **REQ-WEB-002 AC-4** — la purge de session sur 401. Elle était déclarée
 *   `implemented` alors qu'aucun code ne la réalisait, parce que le test qui
 *   portait son nom cliquait sur le bouton de déconnexion manuelle. Ici, le 401
 *   vient d'une vraie réponse `fetch`.
 * - **le jeton lu par closure** — la logique qui évite qu'un client construit
 *   une fois continue d'envoyer l'ancien jeton après une reconnexion.
 */

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('REQ-WEB-002 — purge de session sur 401', () => {
  /**
   * Sonde câblée comme `ApiClientProvider` : un client construit **une fois**,
   * qui lit le jeton et notifie la purge par closure.
   */
  function ApiProbe() {
    const { user, status, signIn, signOut } = useSession()
    const client = useMemoOnce(() =>
      createApiClient({
        baseUrl: 'http://api.test/api',
        getToken: () => sessionRef.token,
        onUnauthorized: () => sessionRef.signOut(),
        fetchImpl,
      })
    )

    // Reflète la session courante dans la ref lue par le client.
    sessionRef.token = user?.token ?? null
    sessionRef.signOut = signOut

    return (
      <div>
        <span data-testid="status">{status}</span>
        <button type="button" onClick={() => signIn(jake)}>
          connexion
        </button>
        <button
          type="button"
          onClick={() => {
            client.getCurrentUser().catch(() => undefined)
          }}
        >
          appel
        </button>
      </div>
    )
  }

  const sessionRef: { token: string | null; signOut: () => void } = {
    token: null,
    signOut: () => undefined,
  }
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>

  /** Équivalent minimal de `useMemo(fn, [])`, sans dépendre de React ici. */
  const memo = new WeakMap<object, unknown>()
  const memoKey = {}
  function useMemoOnce<T>(factory: () => T): T {
    if (!memo.has(memoKey)) {
      memo.set(memoKey, factory())
    }
    return memo.get(memoKey) as T
  }

  beforeEach(() => {
    memo.delete(memoKey)
    sessionRef.token = null
    fetchImpl = vi.fn<typeof fetch>()
  })

  it('AC-4: purge la session quand une requête authentifiée revient en 401', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ errors: { authorization: ['is invalid'] } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )

    render(
      <SessionProvider>
        <ApiProbe />
      </SessionProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'appel' }))

    // Sans la purge, l'interface continuerait d'affirmer une identité que l'API
    // ne reconnaît plus, et chaque action suivante échouerait en silence.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('AC-4: envoie le jeton courant, même après une reconnexion', async () => {
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ user: jake }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    render(
      <SessionProvider>
        <ApiProbe />
      </SessionProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await userEvent.click(screen.getByRole('button', { name: 'connexion' }))
    await userEvent.click(screen.getByRole('button', { name: 'appel' }))

    // Un client qui aurait capturé le jeton à sa construction enverrait encore
    // l'en-tête vide de la session anonyme initiale.
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    const headers = new Headers(fetchImpl.mock.calls.at(-1)?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Token jwt.token.here')
  })
})

describe('REQ-WEB-001 — le 401 d’une requête anonyme ne purge rien', () => {
  it('AC-2: un échec de connexion ne déclenche pas la purge', async () => {
    const signOut = vi.fn()
    const client = createApiClient({
      baseUrl: 'http://api.test/api',
      getToken: () => null,
      onUnauthorized: signOut,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: { 'email or password': ['is invalid'] } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      ),
    })

    // Un 401 sur `POST /users/login` signifie « identifiants refusés », pas
    // « session expirée » : il n'y a aucune session à purger, et déclencher la
    // purge ici brouillerait la distinction.
    await expect(
      client.login({ email: 'jake@jake.jake', password: 'jakejake' })
    ).rejects.toBeInstanceOf(ApiError)
    expect(signOut).not.toHaveBeenCalled()
  })
})
