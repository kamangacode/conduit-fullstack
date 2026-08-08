import type { Article, Comment, User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { CONNECTION_FAILURE_MESSAGE } from '../lib/errors'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { ArticleView } from './ArticleView'
import { CommentSection } from './CommentSection'
import { Navbar } from './Navbar'

/** Tests écrits depuis les critères de REQ-WEB-013, avant l'implémentation. */

// La dernière suite monte la page article entière (AC-8) : la barre y lit le
// chemin courant, et la méta d'article y offre des actions qui naviguent.
vi.mock('next/navigation', () => ({
  usePathname: () => '/article/how-to-train-your-dragon',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const addComment = vi.hoisted(() => vi.fn())
const deleteComment = vi.hoisted(() => vi.fn())
const getArticle = vi.hoisted(() => vi.fn())
const getComments = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({
  useApi: () => ({ addComment, deleteComment, getArticle, getComments }),
}))

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

/** Article servi à la page entière — auteur distinct du lecteur, comme AC-8 le suppose. */
const article: Article = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:22:56.637Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jacob', bio: null, image: null, following: false },
}

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
  getArticle.mockReset().mockResolvedValue(article)
  getComments.mockReset().mockResolvedValue([existing])
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

  it('AC-2: indique à l’anonyme que la connexion est requise, sans formulaire', () => {
    const { container } = renderSection()

    expect(screen.queryByRole('button', { name: 'Post Comment' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument()
    expect(screen.getByText(/Sign in or sign up to add comments/)).toBeInTheDocument()
    // Le message explique l'absence de formulaire ; il ne **duplique** pas les
    // liens d'authentification que la barre porte déjà. C'est le geste honnête
    // pour tenir AC-8 : rendre le doublon en `<button>` ferait disparaître le
    // match du contrat sans rien changer au comportement.
    expect(container.querySelector('a[href="/login"]')).toBeNull()
    expect(container.querySelector('a[href="/register"]')).toBeNull()
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

describe('REQ-WEB-013 AC-8 — la page article d’un anonyme, telle que la route la compose', () => {
  /**
   * Ce que la route monte réellement, et non un assemblage propre au test.
   *
   * L'invariant à prouver est une propriété de la **page** : le contrat de
   * sélecteurs traite `a[href="/login"]` comme un singleton, donc un locator qui
   * en résout deux lève au lieu de réussir sur le premier. Le prouver sur la
   * barre posée à côté de la seule section laissait hors du test tout ce que la
   * route rend entre les deux — méta d'article, boutons suivre et favori,
   * écrans d'absence ou d'indisponibilité. Un second `/login` introduit par l'un
   * d'eux serait passé inaperçu ici et n'aurait cassé que la suite e2e, c'est-à-
   * dire le plus tard et le plus cher.
   *
   * On monte donc les deux composants que la route monte : `Navbar`, posé par le
   * layout racine, et `ArticleView`, rendu par `app/article/[slug]/page.tsx` —
   * qui n'est plus qu'un adaptateur de deux lignes depuis l'[ADR 020]. Le layout
   * lui-même ne peut pas l'être : c'est un Server Component qui rend `<html>`,
   * et sa coquille ne porte aucun lien de connexion.
   *
   * Cette suite porte aussi ce que la suite vendorée ne peut plus prouver.
   * `comments.spec.ts` (« should require login to post comment ») attend un
   * `a[href="/login"]` visible sur la page d'un anonyme : depuis AC-8, c'est
   * celui de la barre qui le satisfait, donc ce test ne dit plus rien de la
   * section. Il garde sa valeur résiduelle — l'absence de formulaire — et la
   * preuve que la section **invite** bien à se connecter vit désormais ici.
   */
  const renderArticleRoute = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        {/* Anonyme par le stockage vidé au `beforeEach` : sans jeton, la
            réhydratation ne demande rien à l'API et la session tombe
            directement sur « anonymous ». */}
        <SessionProvider fetchCurrentUser={async () => jake}>
          <Navbar />
          <ArticleView slug="how-to-train-your-dragon" />
        </SessionProvider>
      </QueryClientProvider>
    )

  /** L'invite marque la fin du chargement : l'article **et** ses commentaires sont rendus. */
  const anonymousInvite = () => screen.findByText(/Sign in or sign up to add comments/)

  it('AC-8: expose exactement un `a[href="/login"]` sur la page, celui de la barre', async () => {
    const { container } = renderArticleRoute()

    await anonymousInvite()
    expect(container.querySelector('.navbar a[href="/login"]')).toBeInTheDocument()
    expect(container.querySelectorAll('a[href="/login"]')).toHaveLength(1)
  })

  it('AC-8: ne propose aucun champ de commentaire à l’anonyme', async () => {
    const { container } = renderArticleRoute()

    await anonymousInvite()
    expect(container.querySelector('textarea[placeholder="Write a comment..."]')).toBeNull()
  })

  it('AC-2: porte l’invite dans la section, et n’en fait pas un second lien', async () => {
    // Ce que la suite vendorée ne peut plus distinguer : que l'invite vienne de
    // la page article et non de la barre. Sans cette assertion, retirer
    // entièrement le message laisserait les deux suites au vert.
    const { container } = renderArticleRoute()

    const invite = await anonymousInvite()

    expect(container.querySelector('.article-page')).toContainElement(invite)
    expect(invite.closest('a')).toBeNull()
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
