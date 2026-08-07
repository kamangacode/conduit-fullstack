import type { Profile, User } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api-client'
import { SessionProvider, TOKEN_STORAGE_KEY } from '../lib/session'
import { ProfileView } from './ProfileView'

/**
 * Tests de REQ-WEB-005, REQ-WEB-007 et REQ-WEB-015, repris de
 * `app/profile-page.spec.tsx`.
 *
 * La page ne charge plus le profil ([ADR 020]) : elle précharge la liste
 * d'articles et délègue le reste à ce composant, qui est donc l'endroit où ces
 * critères s'éprouvent désormais. AC-6 a changé de sens dans l'opération et est
 * réécrit plutôt que déplacé.
 *
 * Le composant est monté sous un **vrai** `SessionProvider` depuis AC-7 : c'est
 * la résolution de la session qui commande l'émission de la requête, donc la
 * simuler par une valeur figée retirerait au test la seule chose qu'il éprouve.
 */

const getProfile = vi.hoisted(() => vi.fn())

// Le client API est doublé, mais le **jeton** qu'il lit vient de la vraie
// session, à l'instant de l'appel — exactement comme `ApiClientProvider` le lit
// par `tokenRef`. C'est ce qui rend observable ici l'identité que la requête
// réelle porterait dans son en-tête `Authorization` (AC-7).
vi.mock('../lib/api-provider', async () => {
  const { useSession } = await import('../lib/session')
  return {
    useApi: () => {
      const { token } = useSession()
      return { getProfile: (username: string) => getProfile(username, token) }
    },
  }
})

// `FollowButton` et `FeedList` consomment la session, le client API et le cache
// de requêtes : ils ont leurs propres specs, et les monter ici ferait échouer
// ces tests pour une raison sans rapport avec ce qu'ils vérifient.
vi.mock('./FollowButton', () => ({ FollowButton: () => null }))
vi.mock('./FeedList', () => ({
  FeedList: ({ feed, pathname }: { feed: { kind: string }; pathname: string }) => (
    <div data-testid="feed" data-kind={feed.kind} data-pathname={pathname} />
  ),
}))

const jacob: Profile = { username: 'jacob', bio: null, image: null, following: false }

const jake: User = {
  email: 'jake@jake.jake',
  token: 'jwt.token.here',
  username: 'jake',
  bio: null,
  image: null,
}

/**
 * Rend le composant sous la session par défaut : **aucun jeton conservé**, donc
 * `useRehydration` pose `anonymous` sans aller-retour et la requête part au
 * rendu suivant. C'est le cas du visiteur anonyme, et il ne paie rien.
 */
const renderView = (
  tab: 'author' | 'favorited' = 'author',
  username = 'jacob',
  fetchCurrentUser: (token: string) => Promise<User> = async () => jake
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <SessionProvider fetchCurrentUser={fetchCurrentUser}>
        <ProfileView username={username} tab={tab} page={1} />
      </SessionProvider>
    </QueryClientProvider>
  )

beforeEach(() => {
  window.localStorage.clear()
  getProfile.mockReset().mockResolvedValue(jacob)
})

describe('REQ-WEB-007 — contrat de sélecteurs, page de profil', () => {
  it('AC-3: rend l’avatar par défaut quand le compte n’a pas d’image', async () => {
    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('img.user-img')).not.toBeNull())
    expect(container.querySelector('img.user-img')?.getAttribute('src')).toContain(
      'default-avatar.svg'
    )
  })

  it('AC-4: rend l’image du compte quand elle existe', async () => {
    getProfile.mockResolvedValue({ ...jacob, image: 'https://example.test/jacob.png' })

    const { container } = renderView()

    await waitFor(() =>
      expect(container.querySelector('img.user-img')).toHaveAttribute(
        'src',
        'https://example.test/jacob.png'
      )
    )
  })

  it('AC-9: rend un paragraphe vide, et non aucun paragraphe, sur une bio `null`', async () => {
    // Le défaut que ce critère ferme : `{bio && <p>…</p>}` supprimait
    // l'élément. Le contrat lit `.user-info p` et attend `''` — sans élément,
    // le sélecteur n'aboutit pas, et l'échec désigne la page entière au lieu du
    // champ. C'est l'état d'un compte neuf, donc celui de tout nouvel inscrit.
    getProfile.mockResolvedValue({ ...jacob, bio: null })

    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('.user-info p')).not.toBeNull())
    expect(container.querySelector('.user-info p')?.textContent).toBe('')
  })

  it('AC-9: rend un paragraphe vide sur une bio effacée (chaîne vide)', async () => {
    // `''` et `null` sont la **même** absence : le contrat partagé normalise la
    // chaîne vide en `null` (ADR 017, qui amende l'ADR 004 sur ce point en
    // déplaçant la normalisation de la persistance vers `packages/shared`),
    // mais le rendu ne doit pas dépendre de ce passage —
    // une réponse en cache ou une mutation optimiste peut porter `''`.
    getProfile.mockResolvedValue({ ...jacob, bio: '' })

    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('.user-info p')).not.toBeNull())
    expect(container.querySelector('.user-info p')?.textContent).toBe('')
  })

  it('AC-9: n’écrit jamais la chaîne littérale « null » à la place de la bio', async () => {
    // Le symptôme que nomme le test de conformité : interpoler une valeur
    // nullable sans la normaliser affiche `null` au visiteur.
    getProfile.mockResolvedValue({ ...jacob, bio: null })

    const { container } = renderView()

    await waitFor(() => expect(container.querySelector('.user-info p')).not.toBeNull())
    expect(container.querySelector('.user-info')?.textContent).not.toContain('null')
  })

  it('AC-10: rend exactement le texte de la bio quand elle est renseignée', async () => {
    // La contrepartie du critère précédent : normaliser l'absence ne doit pas
    // effacer la présence. Un seul `<p>` dans `.user-info`, sans quoi le
    // contrat — qui lit ce sélecteur en mode strict — deviendrait ambigu.
    getProfile.mockResolvedValue({ ...jacob, bio: 'I work at statefarm' })

    const { container } = renderView()

    await waitFor(() =>
      expect(container.querySelector('.user-info p')?.textContent).toBe('I work at statefarm')
    )
    expect(container.querySelectorAll('.user-info p')).toHaveLength(1)
  })
})

describe('REQ-WEB-005 — profil public', () => {
  it('AC-1: rend l’écran d’attente sans `.user-info`, puis le profil une fois la réponse arrivée', async () => {
    // Le critère d'origine affirmait que le **serveur** rendait déjà username,
    // bio et image. C'était vrai avant l'[ADR 020] et ne l'est plus : ce test
    // éprouve donc la transition réelle, et non le seul fait que React sait
    // rendre une chaîne — un test qui aurait été vert dans les deux mondes, donc
    // aveugle au changement (§4.6 du dossier #15).
    let resolveProfile: (profile: Profile) => void = () => undefined
    getProfile.mockReturnValue(
      new Promise<Profile>((resolve) => {
        resolveProfile = resolve
      })
    )

    const { container } = renderView()

    expect(container.querySelector('.profile-page')).not.toBeNull()
    expect(container.querySelector('.user-info')).toBeNull()

    resolveProfile({ ...jacob, bio: 'I work at statefarm' })

    await waitFor(() =>
      expect(container.querySelector('.profile-page .user-info h4')).toHaveTextContent('jacob')
    )
    expect(container.querySelector('.user-info p')).toHaveTextContent('I work at statefarm')
  })

  it('AC-7: n’émet aucune requête tant que la session n’a pas résolu son jeton', async () => {
    // Le défaut que ce critère ferme, et qui coûtait les trois échecs de
    // `social.spec.ts` : montée sous `pending`, la requête part **anonyme**,
    // l'API répond `following: false` — correctement, pour l'appelant qu'elle a
    // vu — et rien ne la reprend (clé sans identité du lecteur, `staleTime` de
    // trente secondes, refetch au focus désactivé). Le lecteur qui suit voit
    // « Follow » à chaque chargement.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    let resolveUser: (user: User) => void = () => undefined
    const fetchCurrentUser = vi.fn(
      () =>
        new Promise<User>((resolve) => {
          resolveUser = resolve
        })
    )

    renderView('author', 'jacob', fetchCurrentUser)

    // La session est bien en train de se résoudre — et le profil n'a pourtant
    // rien demandé.
    await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledWith(jake.token))
    expect(getProfile).not.toHaveBeenCalled()

    resolveUser(jake)

    await waitFor(() => expect(getProfile).toHaveBeenCalledOnce())
  })

  it('AC-7: émet la requête avec le jeton du lecteur une fois la session résolue', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)

    renderView()

    // Une requête, et une seule, portant l'identité du lecteur : c'est ce que
    // l'en-tête `Authorization` du client réel transporte. Un second appel
    // signalerait le retour de la double requête que l'option B du cadrage
    // écartait — celle qui fait clignoter le bouton de « Follow » à « Unfollow ».
    await waitFor(() => expect(getProfile).toHaveBeenCalledWith('jacob', jake.token))
    expect(getProfile).toHaveBeenCalledOnce()
  })

  it('AC-7: émet la requête de profil une fois la session « unavailable », pas seulement « authenticated »', async () => {
    // La garde s'écrit sur `pending` **seul** : `anonymous`, `authenticated` et
    // `unavailable` sont trois réponses. `unavailable` conserve un jeton qu'on
    // n'a pas pu vérifier (REQ-WEB-016) — ce n'est pas `pending`, et rien ne
    // dispense donc la page d'émettre sa requête avec ce jeton, l'API tranchera.
    // Sans ce test, une régression qui gate la requête sur `authenticated` au
    // lieu de `!== 'pending'` resterait invisible : les deux prédicats ne
    // divergent que sur cet état-ci.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, jake.token)
    const fetchCurrentUser = vi.fn(() => Promise.reject(new ApiError(500, {})))

    renderView('author', 'jacob', fetchCurrentUser)

    await waitFor(() => expect(getProfile).toHaveBeenCalledWith('jacob', jake.token))
  })

  it('AC-7: n’attend rien d’un visiteur anonyme', async () => {
    // Sans jeton conservé, `useRehydration` pose `anonymous` sans aller-retour :
    // la garde ne coûte donc qu'un rendu de plus, jamais une requête.
    renderView()

    await waitFor(() => expect(getProfile).toHaveBeenCalledWith('jacob', null))
  })

  it('AC-6: rend la coquille « profil introuvable » sur un username inconnu', async () => {
    // Le critère exigeait une **vraie 404**. Le chargement client l'a rendue
    // impossible — le serveur a répondu avant que l'absence soit connue — et
    // l'[ADR 020] l'assume : ce qui reste opposable est ce que le lecteur voit.
    getProfile.mockRejectedValue(new ApiError(404, {}))

    renderView('author', 'fantome')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Profile not found' })).toBeInTheDocument()
    )
  })

  it('AC-6: distingue une panne de l’API d’un profil absent', async () => {
    // « Ce compte n'existe pas » affiché pendant une panne est un message faux,
    // au moment le plus coûteux.
    getProfile.mockRejectedValue(new ApiError(500, {}))

    renderView()

    await waitFor(
      () =>
        expect(screen.getByRole('heading', { name: 'Profile unavailable' })).toBeInTheDocument(),
      { timeout: 3000 }
    )
    expect(screen.queryByRole('heading', { name: 'Profile not found' })).not.toBeInTheDocument()
  })

  it('AC-1: n’annonce pas un profil absent tant que la réponse n’est pas arrivée', () => {
    // L'écran d'attente ne doit pas emprunter le message d'absence : le
    // visiteur conclurait que le compte n'existe pas, puis verrait la page
    // apparaître — le pire des deux.
    getProfile.mockReturnValue(new Promise(() => {}))

    const { container } = renderView()

    expect(container.querySelector('.profile-page')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Profile not found' })).not.toBeInTheDocument()
  })

  it('AC-1: l’écran d’attente n’imbrique pas `.user-info`', () => {
    // Même contrainte que la coquille d'erreur (REQ-WEB-018) : le contrat
    // localise la page par `.profile-page, .user-info` en mode strict, et un
    // test qui arrive pendant le chargement voit cet écran-là. Deux tests
    // amont échouaient dessus après le passage au chargement client.
    getProfile.mockReturnValue(new Promise(() => {}))

    const { container } = renderView()

    expect(container.querySelectorAll('.profile-page, .user-info')).toHaveLength(1)
  })
})

describe('REQ-WEB-015 — onglets du profil', () => {
  it('AC-1: liste les articles publiés sur l’onglet par défaut', async () => {
    renderView('author')

    await waitFor(() => expect(screen.getByTestId('feed')).toHaveAttribute('data-kind', 'author'))
    expect(screen.getByRole('link', { name: 'My Articles' })).toHaveClass('active')
  })

  it('AC-2: liste les articles favorisés sur l’onglet des favoris', async () => {
    renderView('favorited')

    await waitFor(() =>
      expect(screen.getByTestId('feed')).toHaveAttribute('data-kind', 'favorited')
    )
    expect(screen.getByRole('link', { name: 'Favorited Articles' })).toHaveClass('active')
  })

  it('AC-6: la pagination conserve l’onglet courant', async () => {
    // Sans cela, passer à la page 2 des favoris ramènerait aux articles publiés
    // — un bug qui se lit comme une perte de filtre.
    renderView('favorited')

    await waitFor(() =>
      expect(screen.getByTestId('feed')).toHaveAttribute(
        'data-pathname',
        '/profile/jacob/favorites'
      )
    )
  })
})
