import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthenticatedAccount } from './authenticated-page'
import { SessionProvider, TOKEN_STORAGE_KEY, useSession } from './session'

/**
 * Tests de la règle des pages authentifiées (REQ-WEB-019).
 *
 * Elle est testée **ici**, au niveau du hook, et non deux fois dans les pages
 * qui l'appellent : c'est tout l'objet d'AC-4. Les pages, elles, vérifient
 * qu'elles la consomment — pas qu'elle est juste.
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

/**
 * Page authentifiée minimale : elle ne fait rien d'autre qu'appliquer la règle
 * et rendre le compte retenu, plus un moyen de fermer la session depuis
 * l'extérieur — le geste qu'aucune interaction de la page ne produit, et qui
 * est pourtant exactement ce qu'un 401 sur une requête en vol provoque.
 */
function ProbePage() {
  const account = useAuthenticatedAccount()
  const { status, signOut } = useSession()

  return (
    <>
      <span data-testid="account">{account?.username ?? 'aucun'}</span>
      <span data-testid="status">{status}</span>
      <button type="button" onClick={signOut}>
        fermer la session
      </button>
    </>
  )
}

const renderProbe = () =>
  render(
    <SessionProvider fetchCurrentUser={async () => jake}>
      <ProbePage />
    </SessionProvider>
  )

beforeEach(() => {
  window.localStorage.clear()
  push.mockClear()
})

describe('REQ-WEB-019 — règle des pages authentifiées', () => {
  it('AC-2: redirige celui qui arrive sans jeton', async () => {
    renderProbe()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
    expect(screen.getByTestId('account')).toHaveTextContent('aucun')
  })

  it('AC-2: ne redirige pas pendant la résolution de la session', async () => {
    // `pending` n'est ni « anonyme » ni « connecté ». Rediriger là éjecterait
    // les utilisateurs connectés, les effets React se déclenchant des enfants
    // vers les parents : celui de la page s'exécute avant que le fournisseur
    // ait relu le stockage.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('account')).toHaveTextContent('jake'))
    expect(push).not.toHaveBeenCalled()
  })

  it('AC-1: retient le compte quand la session est purgée en cours de route', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('account')).toHaveTextContent('jake'))

    await userEvent.click(screen.getByRole('button', { name: 'fermer la session' }))

    // Le compte survit : c'est lui qui permet à la page de continuer à rendre
    // son formulaire, donc d'afficher le message qui explique la purge.
    expect(screen.getByTestId('account')).toHaveTextContent('jake')
    expect(push).not.toHaveBeenCalled()
  })

  it('AC-5: ne prolonge pas la session — le statut publié redevient anonyme', async () => {
    // La contrepartie indispensable du test précédent. Une page qui garderait
    // son formulaire *en prétendant la session ouverte* serait un défaut plus
    // grave que celui qu'on corrige : le compte retenu sert à rendre, jamais à
    // faire autorité.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'fermer la session' }))

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('AC-4: aucune page authentifiée ne porte sa propre copie de la règle', async () => {
    // Un critère **structurel**, donc un test structurel : ce qu'AC-4 promet
    // n'est pas un comportement de plus (les autres tests le couvrent déjà des
    // deux côtés), c'est l'absence d'une seconde écriture. La seule façon de le
    // vérifier est de regarder les fichiers.
    //
    // Ce n'est pas de la cosmétique : le défaut d'origine venait précisément
    // d'une règle écrite dans une page et pas dans l'autre. Un test qui échoue
    // le jour où quelqu'un recopie `push('/login')` dans une troisième page
    // authentifiée vaut mieux qu'une convention que personne ne relit.
    //
    // Les motifs tolèrent les deux styles de guillemets (`'` et `"`) que
    // Biome laisse cohabiter dans ce dépôt selon le contexte (apostrophe
    // française dans une chaîne à interpoler, par exemple) : un grep qui ne
    // reconnaîtrait qu'un seul style laisserait passer une copie locale
    // écrite avec l'autre, sans qu'aucune règle de lint ne le signale — Biome
    // ne vérifie pas la présence d'un mot-clé, seulement la cohérence des
    // guillemets une fois le style choisi.
    //
    // Chemins depuis la racine du workspace `apps/web`, où Vitest s'exécute.
    // `import.meta.url` ne serait pas un `file:` sous l'environnement jsdom.
    const paths = ['src/app/settings/page.tsx', 'src/components/ArticleEditor.tsx']

    for (const name of paths) {
      const source = readFileSync(resolve(process.cwd(), name), 'utf8')
      expect(source, `${name} doit consommer la règle partagée`).toContain(
        'useAuthenticatedAccount'
      )
      // La destination de la redirection n'apparaît plus que dans le hook : sa
      // présence ici signalerait une copie locale de la décision.
      expect(source, `${name} ne doit pas rediriger lui-même`).not.toMatch(/['"]\/login['"]/)
      expect(source, `${name} ne doit pas relire le statut de session`).not.toMatch(
        /status\s*===\s*['"]anonymous['"]/
      )
    }
  })
})
