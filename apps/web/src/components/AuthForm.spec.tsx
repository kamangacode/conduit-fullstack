import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { AuthForm } from './AuthForm'

/** Tests écrits depuis les critères de REQ-WEB-003, avant l'implémentation. */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const submit = vi.fn()

const renderForm = (mode: 'login' | 'register' = 'login') =>
  render(<AuthForm mode={mode} onSubmit={submit} />)

beforeEach(() => {
  push.mockClear()
  submit.mockReset().mockResolvedValue(undefined)
})

describe('REQ-WEB-003 — formulaires d’authentification', () => {
  it('AC-6: suit le markup RealWorld de la page d’authentification', () => {
    const { container } = renderForm()

    expect(container.querySelector('.auth-page')).not.toBeNull()
    expect(container.querySelector('.form-control.form-control-lg')).not.toBeNull()
    expect(container.querySelector('button.btn.btn-lg.btn-primary')).not.toBeNull()
  })

  it('AC-6: propose le lien croisé vers l’autre page', () => {
    renderForm('login')

    expect(screen.getByRole('link', { name: /Need an account\?/ })).toHaveAttribute(
      'href',
      '/register'
    )
  })

  it('AC-1: l’inscription demande un username, la connexion non', () => {
    const { unmount } = renderForm('register')
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    unmount()

    renderForm('login')
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument()
  })

  it('AC-2: transmet les identifiants saisis', async () => {
    renderForm('login')

    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'jakejake')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ email: 'jake@jake.jake', password: 'jakejake' })
    )
  })

  it('AC-3: refuse un email invalide sans appeler l’API', async () => {
    renderForm('login')

    await userEvent.type(screen.getByPlaceholderText('Email'), 'pas-un-email')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'jakejake')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    // La règle appliquée est celle de `@repo/shared` — la même que l'API
    // appliquerait. Ce n'est pas une validation « en double » mais la même,
    // exécutée plus tôt.
    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())
    expect(submit).not.toHaveBeenCalled()
  })

  it('AC-3: refuse un mot de passe trop court à l’inscription', async () => {
    // La longueur minimale est une règle d'**inscription**, pas de connexion :
    // `loginDtoSchema` n'exige qu'un mot de passe non vide, parce qu'appliquer
    // la politique au login renverrait un 422 là où un compte au secret plus
    // court doit recevoir un 401. Le formulaire hérite de cette asymétrie du
    // modèle partagé au lieu de la réinventer — c'est tout l'intérêt.
    renderForm('register')

    await userEvent.type(screen.getByPlaceholderText('Username'), 'jake')
    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'court')
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())
    expect(submit).not.toHaveBeenCalled()
  })

  it('AC-3: accepte à la connexion un mot de passe court, que l’API arbitrera', async () => {
    renderForm('login')

    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'court')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    // Le front ne durcit pas ce que le contrat laisse passer : il enverrait
    // sinon un refus local là où l'API sait, elle, si le compte existe.
    await waitFor(() => expect(submit).toHaveBeenCalled())
  })

  it('AC-4: affiche les erreurs de l’API dans une liste .error-messages', async () => {
    submit.mockRejectedValue(new ApiError(422, { email: ['has already been taken'] }))
    const { container } = renderForm('register')

    await userEvent.type(screen.getByPlaceholderText('Username'), 'jake')
    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'jakejake')
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    await waitFor(() =>
      expect(screen.getByText('email has already been taken')).toBeInTheDocument()
    )
    expect(container.querySelector('ul.error-messages')).not.toBeNull()
  })

  it('AC-5: affiche un message générique sur un 401, sans distinguer les causes', async () => {
    // L'API répond volontairement la même chose pour un email inconnu et un mot
    // de passe erroné (REQ-USER-003 AC-3). Un front qui afficherait « ce compte
    // n'existe pas » rouvrirait la fuite d'énumération que l'API a fermée.
    submit.mockRejectedValue(new ApiError(401, {}))
    renderForm('login')

    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'jakejake')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const message = await screen.findByText(/email or password is invalid/i)
    expect(message).toBeInTheDocument()
    expect(screen.queryByText(/n'existe pas|not found|unknown/i)).not.toBeInTheDocument()
  })

  it('AC-1: redirige vers l’accueil après un succès', async () => {
    renderForm('login')

    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'jakejake')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('AC-2: désactive le bouton pendant la soumission', async () => {
    let resolveSubmit: (() => void) | undefined
    submit.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve
      })
    )
    renderForm('login')

    await userEvent.type(screen.getByPlaceholderText('Email'), 'jake@jake.jake')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'jakejake')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    // Sans cette garde, un double clic envoie deux inscriptions et la seconde
    // échoue en 409 — l'utilisateur voit une erreur alors que son compte existe.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled())
    resolveSubmit?.()
  })
})

describe('REQ-WEB-007 — contrat de sélecteurs, formulaires d’authentification', () => {
  // Les tests ci-dessus localisent les champs par leur libellé accessible, ce
  // qui est correct et ne dit **rien** du contrat : la suite E2E partagée, elle,
  // les cherche par `input[name="…"]`. Sans ces assertions, l'attribut peut
  // disparaître d'une refonte sans qu'aucun test du dépôt ne bronche.
  it('AC-1: nomme les champs de connexion comme le contrat l’exige', () => {
    const { container } = renderForm('login')

    expect(container.querySelector('input[name="email"]')).not.toBeNull()
    expect(container.querySelector('input[name="password"]')).not.toBeNull()
  })

  it('AC-1: ajoute le champ username à l’inscription, sous son nom de contrat', () => {
    const { container } = renderForm('register')

    expect(container.querySelector('input[name="username"]')).not.toBeNull()
    expect(container.querySelector('input[name="email"]')).not.toBeNull()
    expect(container.querySelector('input[name="password"]')).not.toBeNull()
  })

  it('AC-1: ne pose pas de champ username sur la connexion', () => {
    // Le contrat n'attend `username` que sur l'inscription et les paramètres.
    // En poser un ici ferait échouer un test E2E qui compte les champs — et,
    // plus sûrement, enverrait une clé que `loginDtoSchema` refuse.
    const { container } = renderForm('login')

    expect(container.querySelector('input[name="username"]')).toBeNull()
  })
})
