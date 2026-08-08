import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider } from '../lib/api-provider'
import { TOKEN_STORAGE_KEY } from '../lib/session'
import { ArticleEditor } from './ArticleEditor'

/**
 * REQ-WEB-019 AC-1, rejoué sur le câblage **réel**.
 *
 * `ArticleEditor.spec.tsx` prouve le comportement attendu — formulaire
 * conservé, message affiché — à travers un double qui **rejoue lui-même**
 * l'ordre de production (voir `rejectWithExpiredSession` : `signOut()` avant
 * le rejet). Ce doublé fait une hypothèse : que l'ordre qu'il reproduit est
 * bien celui du câblage réel. Cette hypothèse est correcte
 * (`api-client.ts` appelle `config.onUnauthorized?.()` **avant** de lever),
 * mais rien ne la mettait à l'épreuve — la revue de ce lot l'a signalé.
 *
 * Ce fichier ferme l'écart : `ApiProvider` réel (session + client API tels que
 * `apps/layout` les monte), un seul point de doublure — `fetch` lui-même, au
 * ras du réseau. Si un futur changement inversait l'ordre dans
 * `request()` (`api-client.ts`), ou si le corps que le guard renvoie changeait
 * de forme, ce test — et lui seul dans cette suite — rougirait ; les autres
 * resteraient verts puisqu'ils rejouent l'ordre plutôt que de le vérifier.
 */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * Double de `fetch`, au niveau le plus bas du câblage réel.
 *
 * Deux requêtes seulement dans ce scénario : la réhydratation (`GET /user`,
 * déclenchée par `SessionProvider` par défaut) et la publication
 * (`POST /articles/`, REQ-WEB-008 AC-10). Toute autre requête est un signe que
 * le test ne décrit plus ce qu'il croit décrire.
 */
function fetchDouble(): typeof fetch {
  return vi.fn(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (method === 'GET' && url.endsWith('/user')) {
      return jsonResponse(200, { user: jake })
    }
    if (method === 'POST' && url.endsWith('/articles/')) {
      // La forme exacte que le guard d'authentification renvoie
      // (REQ-ERROR-002 AC-4) — jamais un objet vide.
      return jsonResponse(401, { errors: { token: ['is invalid'] } })
    }

    throw new Error(`requête inattendue dans ce test : ${method} ${url}`)
  }) as unknown as typeof fetch
}

beforeEach(() => {
  window.localStorage.clear()
  push.mockClear()
})

describe('REQ-WEB-019 — câblage réel de la purge à la publication', () => {
  it('AC-1: le message de session expirée apparaît sans redirection, sur le client API et la session réels', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    vi.stubGlobal('fetch', fetchDouble())

    try {
      render(
        <ApiProvider>
          <ArticleEditor />
        </ApiProvider>
      )

      const publish = await screen.findByRole('button', { name: 'Publish Article' })
      await waitFor(() => expect(publish).toBeEnabled())

      await userEvent.type(screen.getByPlaceholderText('Article Title'), 'T')
      await userEvent.type(screen.getByPlaceholderText("What's this article about?"), 'D')
      await userEvent.type(screen.getByPlaceholderText('Write your article (in markdown)'), 'B')
      await userEvent.click(publish)

      // Le message de la page, pas le détail brut du champ `token` que l'API
      // renvoie (lib/errors.ts) : c'est la preuve que l'ordre réel — la purge
      // avant le rejet — laisse bien `ArticleEditor` afficher son message
      // plutôt que de se démonter avant d'en avoir la chance.
      await waitFor(() => expect(screen.getByText(/session has expired/)).toBeInTheDocument())
      expect(push).not.toHaveBeenCalledWith('/login')
      expect(screen.getByPlaceholderText('Article Title')).toHaveValue('T')
      // La contrepartie de REQ-WEB-019 AC-5 : la purge a bien eu lieu, sur le
      // vrai stockage.
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
