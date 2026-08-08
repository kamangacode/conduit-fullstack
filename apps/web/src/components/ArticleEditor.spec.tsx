import type { Article, User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { articleQueryKey } from '../lib/content-query'
import { CONNECTION_FAILURE_MESSAGE } from '../lib/errors'
import { SessionProvider, TOKEN_STORAGE_KEY, useSession } from '../lib/session'
import { ArticleEditor } from './ArticleEditor'

/** Tests écrits depuis les critères de REQ-WEB-014, avant l'implémentation. */

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const createArticle = vi.hoisted(() => vi.fn())
const updateArticle = vi.hoisted(() => vi.fn())
vi.mock('../lib/api-provider', () => ({ useApi: () => ({ createArticle, updateArticle }) }))

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

const existing: Article = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jake', bio: null, image: null, following: false },
}

/**
 * Expose la session du rendu courant aux tests : son statut, et le moyen de la
 * fermer **depuis l'extérieur de l'éditeur**.
 *
 * Ce second rôle est indispensable ici. En production, c'est `api-client` qui
 * appelle `onUnauthorized()` — donc `signOut` — quand une requête authentifiée
 * revient en 401, avant de lever l'`ApiError` (REQ-WEB-002 AC-4). Le client
 * étant doublé dans cette spec, aucun geste de l'éditeur ne produit cette
 * purge : le doublé la rejoue lui-même via cette référence, dans le bon ordre.
 */
let closeSession: (() => void) | null = null

function SessionEcho() {
  const { status, signOut } = useSession()
  closeSession = signOut
  return <span data-testid="session-status">{status}</span>
}

/**
 * Le cache de requêtes est monté comme il l'est par le layout racine.
 *
 * L'éditeur écrit l'article enregistré dans le cache partagé avant de rediriger
 * (REQ-WEB-014 AC-8) : sans fournisseur, `useQueryClient` lèverait, et c'est le
 * symptôme attendu de l'ajout — pas une régression. Le client est **rendu** à
 * l'appelant pour que les tests puissent l'amorcer comme le fait
 * `ArticleEditorLoader`, puis lire l'entrée après publication.
 */
const renderEditor = (article?: Article) => {
  // Pas de `gcTime: 0` : une entrée sans observateur serait ramassée aussitôt et
  // les assertions liraient `undefined` — un vert qui ne prouve rien. Chaque
  // rendu a son client, donc rien ne fuit d'un test à l'autre.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider fetchCurrentUser={async () => jake}>
          {article ? <ArticleEditor article={article} /> : <ArticleEditor />}
          <SessionEcho />
        </SessionProvider>
      </QueryClientProvider>
    ),
  }
}

/**
 * Réponse d'un enregistrement dont le jeton est refusé, **purge comprise**.
 *
 * L'ordre reproduit celui du client réel : la session est fermée d'abord, puis
 * l'erreur remonte à l'appelant. C'est précisément cet ordre qui fabriquait le
 * défaut — la page passait en « anonyme » avant même de voir l'erreur.
 *
 * Le corps porte `{ token: […] }`, la forme que le guard d'authentification
 * renvoie réellement (REQ-ERROR-002 AC-3/AC-4) — jamais un objet vide. Un
 * double qui construirait `ApiError(401, {})` prouverait un comportement que la
 * vraie API ne déclenche jamais : `toMessages` (`lib/errors.ts`) traite les
 * deux formes différemment, et seule celle-ci éprouve le chemin réel.
 */
const rejectWithExpiredSession = async () => {
  closeSession?.()
  throw new ApiError(401, { token: ['is invalid'] })
}

const signedIn = () => window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

/**
 * Remplit les trois champs que la validation partagée exige, **au minimum**.
 *
 * Un caractère par champ : ces tests-là portent sur ce qui arrive *après* la
 * soumission, et chaque frappe simulée coûte un cycle de rendu complet. Les
 * tests qui vérifient la valeur envoyée à l'API, eux, saisissent du texte réel.
 */
const fillRequiredFields = async () => {
  await userEvent.type(screen.getByPlaceholderText('Article Title'), 'T')
  await userEvent.type(screen.getByPlaceholderText("What's this article about?"), 'D')
  await userEvent.type(screen.getByPlaceholderText('Write your article (in markdown)'), 'B')
}

/** Attend la résolution de session : le bouton est désactivé avant. */
const publishButton = async () => {
  const button = await screen.findByRole('button', { name: 'Publish Article' })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

beforeEach(() => {
  window.localStorage.clear()
  push.mockClear()
  closeSession = null
  createArticle.mockReset().mockResolvedValue({ ...existing, slug: 'nouveau-slug' })
  updateArticle.mockReset().mockResolvedValue({ ...existing, slug: 'titre-renomme' })
})

describe('REQ-WEB-019 — l’éditeur survit à une purge de session', () => {
  it('AC-1: garde le formulaire monté et affiche le message quand la publication répond 401', async () => {
    // Le défaut que ce critère ferme : le 401 purge la session, l'éditeur
    // passait en « anonyme » et redirigeait vers la connexion. `setErrors` avait
    // bien eu lieu — mais la page n'était plus là pour le rendre. L'auteur
    // voyait son texte disparaître sans jamais lire pourquoi.
    createArticle.mockImplementation(rejectWithExpiredSession)
    signedIn()
    renderEditor()
    const publish = await publishButton()

    await fillRequiredFields()
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByText(/session has expired/)).toBeInTheDocument())
    expect(push).not.toHaveBeenCalledWith('/login')
    expect(screen.getByPlaceholderText('Article Title')).toHaveValue('T')
  })

  it('AC-2: redirige quand même celui qui arrive sur l’éditeur sans session', async () => {
    // La garde d'AC-1 ne doit pas désarmer la redirection : personne ne reste
    // devant un éditeur sans compte résolu (REQ-WEB-014 AC-6).
    renderEditor()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
  })

  it('AC-3: conserve les valeurs saisies, et non celles de l’article d’origine', async () => {
    // Le piège de la modification : un remontage renverrait les champs à
    // `article.title`, et l'auteur croirait sa réécriture perdue alors que seul
    // l'enregistrement a échoué.
    updateArticle.mockImplementation(rejectWithExpiredSession)
    signedIn()
    renderEditor(existing)
    const publish = await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Article Title'), '-bis')
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByText(/session has expired/)).toBeInTheDocument())
    expect(screen.getByPlaceholderText('Article Title')).toHaveValue(`${existing.title}-bis`)
    expect(screen.getByPlaceholderText('Article Title')).not.toHaveValue(existing.title)
  })

  it('AC-5: la session publiée redevient anonyme — la page ne prétend pas le contraire', async () => {
    // La contrepartie du reste : garder le formulaire ne doit pas laisser
    // croire que la session est encore ouverte. Le jeton est bien purgé.
    createArticle.mockImplementation(rejectWithExpiredSession)
    signedIn()
    renderEditor()
    const publish = await publishButton()

    await fillRequiredFields()
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByText(/session has expired/)).toBeInTheDocument())
    expect(screen.getByTestId('session-status')).toHaveTextContent('anonymous')
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})

describe('REQ-WEB-017 — traduction partagée des échecs', () => {
  it('AC-4: rend le message commun quand la publication ne joint pas le serveur', async () => {
    createArticle.mockRejectedValue(new TypeError('Failed to fetch'))
    signedIn()
    renderEditor()
    const publish = await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Article Title'), 'Un titre')
    await userEvent.type(screen.getByPlaceholderText("What's this article about?"), 'Un résumé')
    await userEvent.type(
      screen.getByPlaceholderText('Write your article (in markdown)'),
      'Un corps'
    )
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByText(CONNECTION_FAILURE_MESSAGE)).toBeInTheDocument())
    // La saisie est conservée : la reperdre punirait l'auteur d'une panne
    // qui ne lui appartient pas.
    expect(screen.getByDisplayValue('Un titre')).toBeInTheDocument()
  })
})

describe('REQ-WEB-014 — éditeur d’article', () => {
  it('AC-1: crée l’article et conduit vers le slug retenu par l’API', async () => {
    signedIn()
    renderEditor()
    const publish = await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Article Title'), 'Un titre')
    await userEvent.type(screen.getByPlaceholderText("What's this article about?"), 'Un résumé')
    await userEvent.type(
      screen.getByPlaceholderText('Write your article (in markdown)'),
      'Un corps'
    )
    await userEvent.click(publish)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/article/nouveau-slug'))
    expect(createArticle).toHaveBeenCalledWith({
      title: 'Un titre',
      description: 'Un résumé',
      body: 'Un corps',
      tagList: [],
    })
  })

  it('AC-2: pré-remplit les champs et les tags de l’article existant', async () => {
    signedIn()

    renderEditor(existing)

    expect(screen.getByPlaceholderText('Article Title')).toHaveValue('How to train your dragon')
    expect(screen.getByPlaceholderText("What's this article about?")).toHaveValue(
      'Ever wonder how?'
    )
    expect(screen.getByPlaceholderText('Write your article (in markdown)')).toHaveValue(
      'It takes a Jacobian'
    )
    expect(screen.getByText('dragons')).toBeInTheDocument()
    expect(screen.getByText('training')).toBeInTheDocument()
  })

  it('AC-3: modifie sur le slug d’origine et suit le slug renvoyé', async () => {
    // La règle R-1 fait dériver le slug du titre : un renommage change l'URL.
    // Rediriger vers le slug qu'on avait mènerait à une page introuvable juste
    // après une modification réussie.
    signedIn()
    renderEditor(existing)
    const publish = await publishButton()

    await userEvent.click(publish)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/article/titre-renomme'))
    expect(updateArticle).toHaveBeenCalledWith('how-to-train-your-dragon', expect.anything())
    expect(createArticle).not.toHaveBeenCalled()
  })

  it('AC-4: n’envoie rien quand un champ obligatoire est fait d’espaces', async () => {
    signedIn()
    renderEditor()
    const publish = await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Article Title'), '   ')
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())
    expect(createArticle).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('AC-5: ajoute un tag à la validation et permet de le retirer', async () => {
    signedIn()
    renderEditor()
    await publishButton()
    const field = screen.getByPlaceholderText('Enter tags')

    await userEvent.type(field, 'dragons{Enter}')

    expect(screen.getByText('dragons')).toBeInTheDocument()
    // Le champ se vide, sinon le tag suivant s'écrirait à la suite du premier.
    expect(field).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag dragons' }))
    expect(screen.queryByText('dragons')).not.toBeInTheDocument()
  })

  it('AC-5: refuse un tag en double', async () => {
    // Le contrat ne les interdit pas et l'API les accepterait : l'article
    // afficherait deux fois le même tag, ce que le lecteur lit comme un bug.
    signedIn()
    renderEditor()
    await publishButton()
    const field = screen.getByPlaceholderText('Enter tags')

    await userEvent.type(field, 'dragons{Enter}')
    await userEvent.type(field, 'dragons{Enter}')

    expect(screen.getAllByText('dragons')).toHaveLength(1)
  })

  it('AC-5: la touche Entrée dans le champ de tags ne publie pas l’article', async () => {
    // Sans garde, l'article partirait au moment où l'auteur croit ajouter un tag.
    signedIn()
    renderEditor()
    await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Enter tags'), 'dragons{Enter}')

    expect(createArticle).not.toHaveBeenCalled()
  })

  it('AC-6: conduit un anonyme à la connexion', async () => {
    renderEditor()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
  })

  it('AC-6: n’éjecte pas un utilisateur connecté au chargement direct', async () => {
    // La session n'est pas résolue au premier rendu : rediriger sur `user ===
    // null` éjecterait les connectés, défaut déjà rencontré sur la page de
    // paramètres.
    signedIn()

    renderEditor(existing)

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Article Title')).toHaveValue('How to train your dragon')
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('AC-8: écrit l’article renvoyé dans le cache **avant** de rediriger', async () => {
    // L'ordre est tout le critère : après `push`, la page cible a déjà lu son
    // entrée. Il se vérifie par les rangs d'appel plutôt que par l'état final,
    // qui resterait juste même si l'écriture arrivait trop tard.
    signedIn()
    const { queryClient } = renderEditor()
    const setQueryData = vi.spyOn(queryClient, 'setQueryData')
    const publish = await publishButton()

    await fillRequiredFields()
    await userEvent.click(publish)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/article/nouveau-slug'))
    expect(queryClient.getQueryData(articleQueryKey('nouveau-slug'))).toEqual({
      ...existing,
      slug: 'nouveau-slug',
    })
    const writeRank = Math.min(...setQueryData.mock.invocationCallOrder)
    const pushRank = push.mock.invocationCallOrder[0]
    if (pushRank === undefined) {
      throw new Error('push aurait dû être appelé : le waitFor ci-dessus vient de le vérifier')
    }
    expect(writeRank).toBeLessThan(pushRank)
  })

  it('AC-9: remplace l’entrée étiquetée quand la modification retire tous les tags', async () => {
    // Le défaut mesuré par `articles.spec.ts:229`. Le cache est amorcé comme
    // `ArticleEditorLoader` l'amorce à l'ouverture de l'éditeur — c'est cette
    // entrée-là, fraîche pendant trente secondes, que la page article servait.
    // Le titre ne bouge pas, donc le slug non plus : même clé, aucun refetch à
    // attendre, et l'échec est déterministe.
    updateArticle.mockResolvedValue({ ...existing, tagList: [] })
    signedIn()
    const { queryClient } = renderEditor(existing)
    queryClient.setQueryData(articleQueryKey(existing.slug), existing)
    const publish = await publishButton()

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag dragons' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag training' }))
    await userEvent.click(publish)

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/article/${existing.slug}`))
    expect(updateArticle).toHaveBeenCalledWith(
      existing.slug,
      expect.objectContaining({ tagList: [] })
    )
    expect(queryClient.getQueryData<Article>(articleQueryKey(existing.slug))?.tagList).toEqual([])
  })

  it('AC-10: retire l’entrée du slug d’origine quand le titre a changé', async () => {
    // Le doublé renvoie `titre-renomme` : l'ancienne clé décrit une ressource
    // qui n'existe plus, et l'API y répond 404. La laisser fraîche servirait un
    // article fantôme à qui revient sur l'ancienne URL.
    signedIn()
    const { queryClient } = renderEditor(existing)
    queryClient.setQueryData(articleQueryKey(existing.slug), existing)
    const publish = await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Article Title'), '-bis')
    await userEvent.click(publish)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/article/titre-renomme'))
    expect(queryClient.getQueryData(articleQueryKey(existing.slug))).toBeUndefined()
    expect(queryClient.getQueryData(articleQueryKey('titre-renomme'))).toBeDefined()
  })

  it('AC-11: ne touche à aucune entrée quand l’API refuse la publication', async () => {
    // Rien n'a été enregistré : écrire quoi que ce soit ferait décrire par le
    // cache un état que l'API n'a jamais confirmé — et la saisie refusée
    // s'afficherait comme si elle avait été acceptée.
    //
    // Seul test du lot qui passe **aussi** contre le code d'avant, et c'est
    // dans sa nature : il énonce une non-écriture, que du code n'écrivant nulle
    // part satisfait trivialement. Sa valeur est en garde de la ligne ajoutée —
    // la déplacer dans un `finally`, ou hors du `try`, le fait rougir.
    updateArticle.mockRejectedValue(new ApiError(422, { title: ["can't be blank"] }))
    signedIn()
    const { queryClient } = renderEditor(existing)
    queryClient.setQueryData(articleQueryKey(existing.slug), existing)
    const publish = await publishButton()

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag dragons' }))
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByText(/can't be blank/)).toBeInTheDocument())
    expect(queryClient.getQueryData(articleQueryKey(existing.slug))).toEqual(existing)
    expect(push).not.toHaveBeenCalled()
    // La saisie reste à l'écran : l'étiquette retirée ne revient pas.
    expect(screen.queryByText('dragons')).not.toBeInTheDocument()
  })

  it('AC-7: affiche les erreurs par champ et préserve la saisie', async () => {
    createArticle.mockRejectedValue(new ApiError(422, { title: ["can't be blank"] }))
    signedIn()
    renderEditor()
    const publish = await publishButton()

    await userEvent.type(screen.getByPlaceholderText('Article Title'), 'Un titre')
    await userEvent.type(screen.getByPlaceholderText("What's this article about?"), 'Un résumé')
    await userEvent.type(
      screen.getByPlaceholderText('Write your article (in markdown)'),
      'Un corps'
    )
    await userEvent.click(publish)

    await waitFor(() => expect(screen.getByText(/can't be blank/)).toBeInTheDocument())
    // Refaire écrire un article entier après un refus serait la pire réponse
    // possible à une erreur de validation.
    expect(screen.getByPlaceholderText('Article Title')).toHaveValue('Un titre')
    expect(screen.getByPlaceholderText('Write your article (in markdown)')).toHaveValue('Un corps')
  })
})
