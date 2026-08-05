import type { Profile, User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_STORAGE_KEY, SessionProvider } from '../lib/session'
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

const renderButton = (profile: Profile = jacobProfile) =>
  render(
    <SessionProvider>
      <FollowButton profile={profile} />
    </SessionProvider>
  )

const signedIn = () => window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(jake))

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

  it('AC-3: suit le markup RealWorld', () => {
    const { container } = renderButton()

    expect(container.querySelector('button.btn.btn-sm.action-btn')).not.toBeNull()
  })
})
