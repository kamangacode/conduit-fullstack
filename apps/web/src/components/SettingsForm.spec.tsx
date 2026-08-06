import type { User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { CONNECTION_FAILURE_MESSAGE } from '../lib/errors'
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

describe('REQ-WEB-017 — traduction partagée des échecs', () => {
  it('AC-4: rend le message commun quand l’enregistrement ne joint pas le serveur', async () => {
    save.mockRejectedValue(new TypeError('Failed to fetch'))
    renderForm()

    await userEvent.type(screen.getByLabelText('Your Name'), '-bis')
    await userEvent.click(screen.getByRole('button', { name: 'Update Settings' }))

    await waitFor(() => expect(screen.getByText(CONNECTION_FAILURE_MESSAGE)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Update Settings' })).toBeEnabled()
  })
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

  // Sans préfixe `AC-n:` : ce test prouve l'affichage des erreurs, un
  // comportement légitime mais qui ne correspond à AUCUN critère de
  // REQ-WEB-004. Il portait auparavant le libellé `AC-4`, recopié depuis
  // `AuthForm.spec.tsx` — or l'AC-4 de REQ-WEB-004 parle du rafraîchissement de
  // la session, couvert désormais par `app/settings/page.spec.tsx`. La matrice
  // de traçabilité rapprochant les tests des critères **par la chaîne** `AC-n:`,
  // ce libellé emprunté masquait un trou réel derrière une couverture apparente.
  it('affiche les erreurs de l’API au format §10', async () => {
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

describe('REQ-WEB-007 — contrat de sélecteurs, page de paramètres', () => {
  it('AC-2: nomme les cinq champs comme le contrat l’exige', () => {
    const { container } = renderForm()

    expect(container.querySelector('input[name="image"]')).not.toBeNull()
    expect(container.querySelector('input[name="username"]')).not.toBeNull()
    expect(container.querySelector('input[name="email"]')).not.toBeNull()
    expect(container.querySelector('input[name="password"]')).not.toBeNull()
  })

  it('AC-2: expose la bio en textarea nommé, et non en input', () => {
    // Le contrat distingue `textarea[name="bio"]` de `input[name="bio"]` : un
    // sélecteur E2E qui vise l'un ne trouve pas l'autre, alors que les deux
    // s'affichent et se saisissent de la même façon en développement.
    const { container } = renderForm()

    expect(container.querySelector('textarea[name="bio"]')).not.toBeNull()
    expect(container.querySelector('input[name="bio"]')).toBeNull()
  })

  it('AC-2: nomme le champ « Your Name » username, comme le contrat, pas name', () => {
    // Piège de traduction : le placeholder dit « Your Name », le contrat dit
    // `username`. Nommer l'attribut d'après ce que l'utilisateur lit ferait
    // échouer la suite E2E sans rien changer à l'affichage.
    const { container } = renderForm()

    expect(container.querySelector('input[name="username"]')).toHaveValue('jake')
  })
})
