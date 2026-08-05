import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { SettingsForm } from './SettingsForm'

/** Tests écrits depuis les critères de REQ-WEB-004, avant l'implémentation. */

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: 'I work at statefarm',
  image: 'https://example.test/jake.png',
}

const save = vi.fn()
const signOut = vi.fn()

const renderForm = (user: User = jake) =>
  render(<SettingsForm user={user} onSave={save} onSignOut={signOut} />)

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined)
  signOut.mockReset()
})

describe('REQ-WEB-004 — page de paramètres', () => {
  it('AC-1: pré-remplit les champs avec le compte courant', () => {
    renderForm()

    expect(screen.getByDisplayValue('jake')).toBeInTheDocument()
    expect(screen.getByDisplayValue('jake@jake.jake')).toBeInTheDocument()
    expect(screen.getByDisplayValue('I work at statefarm')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.test/jake.png')).toBeInTheDocument()
  })

  it('AC-1: laisse le champ mot de passe vide', () => {
    renderForm()

    // Le front de référence ne pré-remplit jamais ce champ, et pour cause :
    // l'API ne renvoie pas le mot de passe (R-9).
    expect(screen.getByPlaceholderText('New Password')).toHaveValue('')
  })

  it('AC-3: n’envoie pas le mot de passe quand le champ est resté vide', async () => {
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    // Le piège : le champ est toujours vide au chargement. Transmettre sa
    // valeur telle quelle enverrait une chaîne vide à CHAQUE enregistrement.
    // Vide signifie « ne pas changer », donc clé absente de la requête.
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('password')
  })

  it('AC-3: envoie le mot de passe quand il est renseigné', async () => {
    renderForm()

    await userEvent.type(screen.getByPlaceholderText('New Password'), 'nouveaumotdepasse')
    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    await waitFor(() =>
      expect(save.mock.calls[0]?.[0]).toMatchObject({ password: 'nouveaumotdepasse' })
    )
  })

  it('AC-2: ne transmet que les champs réellement modifiés', async () => {
    renderForm()

    await userEvent.clear(screen.getByDisplayValue('I work at statefarm'))
    await userEvent.type(screen.getByPlaceholderText('Short bio about you'), 'Nouvelle bio')
    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    await waitFor(() => expect(save).toHaveBeenCalled())
    const payload = save.mock.calls[0]?.[0] as Record<string, unknown>
    // N'envoyer que ce qui change évite d'écraser une valeur modifiée
    // entre-temps depuis un autre onglet.
    expect(payload).toEqual({ bio: 'Nouvelle bio' })
  })

  it('AC-4: affiche les erreurs de l’API au format §10', async () => {
    save.mockRejectedValue(new ApiError(409, { email: ['has already been taken'] }))
    const { container } = renderForm()

    await userEvent.clear(screen.getByDisplayValue('jake@jake.jake'))
    await userEvent.type(screen.getByPlaceholderText('Email'), 'pris@jake.jake')
    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    await waitFor(() =>
      expect(screen.getByText('email has already been taken')).toBeInTheDocument()
    )
    expect(container.querySelector('ul.error-messages')).not.toBeNull()
  })

  it('AC-6: propose la déconnexion', async () => {
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: /Or click here to logout/ }))

    expect(signOut).toHaveBeenCalled()
  })

  it('AC-1: suit le markup RealWorld de la page de paramètres', () => {
    const { container } = renderForm()

    expect(container.querySelector('.settings-page')).not.toBeNull()
    expect(container.querySelector('button.btn.btn-lg.btn-primary')).not.toBeNull()
    expect(container.querySelector('button.btn.btn-outline-danger')).not.toBeNull()
  })

  it('AC-1: accepte un compte sans bio ni image', () => {
    renderForm({ ...jake, bio: null, image: null })

    // `null` est l'absence de valeur (ADR 004) ; un `value={null}` rendrait le
    // champ non contrôlé et React s'en plaindrait à la première frappe.
    expect(screen.getByPlaceholderText('Short bio about you')).toHaveValue('')
    expect(screen.getByPlaceholderText('URL of profile picture')).toHaveValue('')
  })
})
