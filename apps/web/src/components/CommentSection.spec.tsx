import type { Comment, User } from '@repo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { CONNECTION_FAILURE_MESSAGE } from '../lib/errors'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { CommentSection } from './CommentSection'

/** Tests écrits depuis les critères de REQ-WEB-013, avant l'implémentation. */

const addComment = vi.hoisted(() => vi.fn())
const deleteComment = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({ useApi: () => ({ addComment, deleteComment }) }))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const commentBy = (id: number, username: string, body: string): Comment => ({
  id,
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:22:56.637Z',
  body,
  author: { username, bio: null, image: null, following: false },
})

const existing = commentBy(1, 'jacob', 'It takes a Jacobian')

const renderSection = (initialComments: Comment[] = [existing]) =>
  render(
    <SessionProvider fetchCurrentUser={async () => jake}>
      <CommentSection slug="how-to-train-your-dragon" initialComments={initialComments} />
    </SessionProvider>
  )

const signedIn = () => window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

/** Ce que le contrat de sélecteurs compte comme un commentaire publié. */
const postedComments = (container: HTMLElement) =>
  container.querySelectorAll('.card:not(.comment-form) .card-block')

beforeEach(() => {
  window.localStorage.clear()
  addComment.mockReset().mockResolvedValue(commentBy(2, 'jake', 'Merci !'))
  deleteComment.mockReset().mockResolvedValue(undefined)
})

describe('REQ-WEB-013 — commentaires', () => {
  it('AC-1: rend chaque commentaire dans le markup du template', () => {
    const { container } = renderSection()

    expect(postedComments(container)).toHaveLength(1)
    expect(screen.getByText('It takes a Jacobian')).toBeInTheDocument()
    // Le template porte **deux** `.comment-author` dans le pied : celui qui
    // enveloppe l'avatar, puis celui qui porte le nom. Viser le premier venu
    // testerait le lien de l'image, qui n'a pas de texte.
    expect(screen.getByRole('link', { name: 'jacob' })).toHaveAttribute('href', '/profile/jacob')
    expect(container.querySelectorAll('.card-footer .comment-author')).toHaveLength(2)
    expect(container.querySelector('.date-posted')).toHaveTextContent('February 18, 2016')
  })

  it('AC-1: le formulaire n’est pas compté comme un commentaire', async () => {
    // Le contrat compte par `.card:not(.comment-form)` : un formulaire sans
    // cette classe gonflerait le décompte d'un, exactement comme l'indicateur
    // de chargement qui portait la classe des aperçus d'article.
    signedIn()

    const { container } = renderSection()

    await screen.findByRole('button', { name: 'Post Comment' })
    expect(postedComments(container)).toHaveLength(1)
  })

  it('AC-2: propose la connexion à un anonyme, sans formulaire', () => {
    renderSection()

    expect(screen.queryByRole('button', { name: 'Post Comment' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'sign up' })).toHaveAttribute('href', '/register')
  })

  it('AC-3: ajoute le commentaire renvoyé par l’API et vide le champ', async () => {
    signedIn()
    const { container } = renderSection()
    const field = await screen.findByPlaceholderText('Write a comment...')

    await userEvent.type(field, 'Merci !')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))

    await waitFor(() => expect(postedComments(container)).toHaveLength(2))
    expect(addComment).toHaveBeenCalledWith('how-to-train-your-dragon', { body: 'Merci !' })
    expect(field).toHaveValue('')
  })

  it('AC-4: n’envoie rien pour un commentaire fait d’espaces', async () => {
    signedIn()
    renderSection()
    const field = await screen.findByPlaceholderText('Write a comment...')

    await userEvent.type(field, '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))

    // La règle vient du schéma partagé, appliquée à l'identique par l'API : la
    // réécrire ici ferait diverger les deux au premier changement.
    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())
    expect(addComment).not.toHaveBeenCalled()
  })

  it('AC-5: ne propose pas de supprimer le commentaire d’un autre', async () => {
    signedIn()

    renderSection([existing])

    await screen.findByRole('button', { name: 'Post Comment' })
    // Le piège : l'auteur de l'**article** n'est pas l'auteur du **commentaire**.
    expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument()
  })

  it('AC-6: retire de la liste le commentaire que son auteur supprime', async () => {
    signedIn()
    const { container } = renderSection([commentBy(3, 'jake', 'À moi')])
    const remove = await screen.findByRole('button', { name: 'Delete comment' })

    await userEvent.click(remove)

    await waitFor(() => expect(postedComments(container)).toHaveLength(0))
    expect(deleteComment).toHaveBeenCalledWith('how-to-train-your-dragon', 3)
  })

  it('AC-7: garde le commentaire affiché quand la suppression échoue', async () => {
    deleteComment.mockRejectedValue(new Error('réseau'))
    signedIn()
    const { container } = renderSection([commentBy(3, 'jake', 'À moi')])
    const remove = await screen.findByRole('button', { name: 'Delete comment' })

    await userEvent.click(remove)

    // Le retirer malgré l'échec ferait croire à une suppression que l'API n'a
    // pas confirmée — et il réapparaîtrait au rechargement.
    await waitFor(() => expect(screen.getByText(/unable to delete/)).toBeInTheDocument())
    expect(postedComments(container)).toHaveLength(1)
  })

  it('AC-7: signale l’échec d’une publication sans ajouter le commentaire', async () => {
    addComment.mockRejectedValue(new Error('réseau'))
    signedIn()
    const { container } = renderSection()
    const field = await screen.findByPlaceholderText('Write a comment...')

    await userEvent.type(field, 'Merci !')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))

    await waitFor(() => expect(screen.getByText(CONNECTION_FAILURE_MESSAGE)).toBeInTheDocument())
    expect(postedComments(container)).toHaveLength(1)
  })
})

describe('REQ-WEB-017 — traduction partagée des échecs', () => {
  it('AC-4: rend le message commun quand la publication ne joint pas le serveur', async () => {
    addComment.mockRejectedValue(new TypeError('Failed to fetch'))
    signedIn()
    renderSection()
    const field = await screen.findByPlaceholderText('Write a comment...')

    await userEvent.type(field, 'Merci !')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))

    // Le message figé qui vivait dans ce composant disait la même chose pour
    // toutes les causes, et une autre chose que les quatre autres formulaires.
    await waitFor(() => expect(screen.getByText(CONNECTION_FAILURE_MESSAGE)).toBeInTheDocument())
  })

  it('AC-2: laisse parler l’API quand elle a répondu', async () => {
    addComment.mockRejectedValue(new ApiError(422, { body: ["can't be blank"] }))
    signedIn()
    renderSection()
    const field = await screen.findByPlaceholderText('Write a comment...')

    await userEvent.type(field, 'Merci !')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))

    await waitFor(() => expect(screen.getByText("body can't be blank")).toBeInTheDocument())
    expect(screen.queryByText(CONNECTION_FAILURE_MESSAGE)).not.toBeInTheDocument()
  })
})
