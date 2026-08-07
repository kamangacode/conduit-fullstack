import type { Profile, User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { FollowButton } from './FollowButton'

/** Tests écrits depuis les critères de REQ-WEB-005, avant l'implémentation. */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const follow = vi.fn()
const unfollow = vi.fn()
vi.mock('../lib/api-provider', () => ({
  useApi: () => ({ followUser: follow, unfollowUser: unfollow }),
}))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const jacobProfile: Profile = {
  username: 'jacob',
  bio: null,
  image: null,
  following: false,
}

// Depuis l'ADR 014, le stockage ne porte que le jeton et le compte est
// redemandé à l'API : la réponse est donc injectée plutôt que persistée.
const renderButton = (profile: Profile = jacobProfile) =>
  render(
    <SessionProvider fetchCurrentUser={async () => jake}>
      <FollowButton profile={profile} />
    </SessionProvider>
  )

const signedIn = () => window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

beforeEach(() => {
  push.mockClear()
  follow.mockReset().mockResolvedValue({ ...jacobProfile, following: true })
  unfollow.mockReset().mockResolvedValue({ ...jacobProfile, following: false })
})

describe('REQ-WEB-005 — bouton de suivi', () => {
  it('AC-2: s’affiche comme non suivi pour un anonyme', () => {
    renderButton()

    expect(screen.getByRole('button', { name: /Follow jacob/ })).toBeInTheDocument()
  })

  it('AC-2: conduit un anonyme vers la connexion, sans appeler l’API', async () => {
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: /Follow jacob/ }))

    // Les deux mauvaises réponses seraient : masquer le bouton (écart au front
    // de référence) ou laisser partir l'appel pour récolter un 401 que
    // l'interface devrait traduire.
    expect(push).toHaveBeenCalledWith('/login')
    expect(follow).not.toHaveBeenCalled()
  })

  it('AC-3: suit le profil et bascule l’état', async () => {
    signedIn()
    renderButton()

    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /Follow jacob/ }))

    await waitFor(() => expect(follow).toHaveBeenCalledWith('jacob'))
    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()
  })

  it('AC-4: cesse de suivre un profil déjà suivi', async () => {
    signedIn()
    renderButton({ ...jacobProfile, following: true })

    await userEvent.click(await screen.findByRole('button', { name: /Unfollow jacob/ }))

    await waitFor(() => expect(unfollow).toHaveBeenCalledWith('jacob'))
    expect(await screen.findByRole('button', { name: /Follow jacob/ })).toBeInTheDocument()
  })

  it('AC-5: n’affiche pas de bouton de suivi sur son propre profil', async () => {
    signedIn()
    renderButton({ ...jacobProfile, username: 'jake' })

    // Le contrat n'interdit pas l'auto-suivi (REQ-PROFILE-003) : l'interface
    // est donc le seul endroit où ce non-sens peut être évité, et elle l'évite
    // en n'offrant pas l'action.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Edit Profile Settings/ })).toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument()
  })

  it('AC-3: resynchronise l’état quand on change de profil sans démonter', async () => {
    // Navigation cliente d'un profil à l'autre : React réconcilie la même
    // instance, et `useState` ne relit pas son argument. Sans resynchronisation,
    // le bouton de jake affichait l'état de suivi de jacob.
    signedIn()
    const { rerender } = renderButton({ ...jacobProfile, following: true })
    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()

    rerender(
      <SessionProvider>
        <FollowButton profile={{ username: 'martin', bio: null, image: null, following: false }} />
      </SessionProvider>
    )

    expect(await screen.findByRole('button', { name: /Follow martin/ })).toBeInTheDocument()
  })

  it('AC-3: signale un échec au lieu de l’avaler', async () => {
    signedIn()
    follow.mockRejectedValue(new Error('réseau coupé'))
    renderButton()
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: /Follow jacob/ }))

    // Sans le `catch`, l'échec était un rejet non traité : bouton réactivé,
    // état inchangé, et aucun moyen pour le lecteur de savoir que rien ne s'est
    // passé.
    expect(await screen.findByText(/unable to update the follow status/)).toBeInTheDocument()
  })

  it('AC-3: suit le markup RealWorld', () => {
    const { container } = renderButton()

    expect(container.querySelector('button.btn.btn-sm.action-btn')).not.toBeNull()
  })

  it('AC-8: affiche « Unfollow » avant tout clic quand le lecteur suit déjà', async () => {
    // L'état affiché au **chargement** est celui de la prop, sans geste de
    // l'utilisateur. C'est l'assertion que `social.spec.ts` fait juste après un
    // `page.goto` complet : le helper `unfollowUser()` recharge la page et
    // attend `button:has-text("Unfollow")` sans rien cliquer.
    signedIn()
    const { container } = renderButton({ ...jacobProfile, following: true })

    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()
    // La classe distingue les deux états dans le CSS de référence (rule 11) :
    // un libellé juste sur un bouton resté `btn-outline-secondary` se lit encore
    // comme « non suivi ».
    expect(container.querySelector('button.btn-secondary')).not.toBeNull()
    expect(follow).not.toHaveBeenCalled()
    expect(unfollow).not.toHaveBeenCalled()
  })

  it('AC-9: suit une réponse fraîche portant un `following` différent, à username inchangé', async () => {
    // La resynchronisation était conditionnée au changement de **username** :
    // une réponse fraîche pour le *même* profil était donc silencieusement
    // ignorée. Le `key` de la liste protège du changement de profil, pas du
    // rafraîchissement du même.
    signedIn()
    const { rerender } = renderButton({ ...jacobProfile, following: false })
    expect(await screen.findByRole('button', { name: /Follow jacob/ })).toBeInTheDocument()

    rerender(
      <SessionProvider fetchCurrentUser={async () => jake}>
        <FollowButton profile={{ ...jacobProfile, following: true }} />
      </SessionProvider>
    )

    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()
  })

  it('AC-9: conserve l’écart d’une bascule tant que la réponse fraîche ne l’a pas rattrapé', async () => {
    // La contrepartie du critère précédent : dériver des props ne doit pas
    // effacer ce que l'API vient de confirmer. Tant que la prop porte encore la
    // valeur d'avant le clic, c'est l'écart local qui gouverne — c'est
    // exactement ce que « l'état local ne conserve que l'écart produit par une
    // bascule en cours » veut dire.
    signedIn()
    const { rerender } = renderButton({ ...jacobProfile, following: false })
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: /Follow jacob/ }))
    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()

    rerender(
      <SessionProvider fetchCurrentUser={async () => jake}>
        <FollowButton profile={{ ...jacobProfile, following: false }} />
      </SessionProvider>
    )

    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()
  })

  it('AC-9: n’exhume pas un écart déjà invalidé quand une réponse tardive revient à sa valeur de départ', async () => {
    // Le défaut que ce test ferme : l'ancienne invalidation comparait
    // `override.from` à la prop courante à **chaque rendu**, sans jamais vider
    // l'état. Une fois la prop passée à `true` (le serveur confirme le clic),
    // l'écart cessait de s'appliquer — mais restait en mémoire. Qu'une réponse
    // plus tardive ramène la prop à `false`, sa valeur de départ, et l'écart
    // réapparaissait, affichant de nouveau « Unfollow » alors que la donnée
    // fraîche dit le contraire.
    signedIn()
    const { rerender } = renderButton({ ...jacobProfile, following: false })
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: /Follow jacob/ }))
    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()

    // Le serveur confirme : la prop rattrape l'écart, qui s'efface.
    rerender(
      <SessionProvider fetchCurrentUser={async () => jake}>
        <FollowButton profile={{ ...jacobProfile, following: true }} />
      </SessionProvider>
    )
    expect(await screen.findByRole('button', { name: /Unfollow jacob/ })).toBeInTheDocument()

    // Une réponse plus tardive revient, par coïncidence, à la valeur d'avant le
    // clic. Sans l'invalidation définitive, l'écart ressuscite ici.
    rerender(
      <SessionProvider fetchCurrentUser={async () => jake}>
        <FollowButton profile={{ ...jacobProfile, following: false }} />
      </SessionProvider>
    )

    expect(await screen.findByRole('button', { name: /Follow jacob/ })).toBeInTheDocument()
  })
})
