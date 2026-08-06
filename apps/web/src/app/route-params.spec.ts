import { describe, expect, it, vi } from 'vitest'
import ArticlePage, { generateMetadata as articleMetadata } from './article/[slug]/page'
import EditorPage, { generateMetadata as editorMetadata } from './editor/[slug]/page'
import FavoritesPage, {
  generateMetadata as favoritesMetadata,
} from './profile/[username]/favorites/page'
import ProfileRoutePage, { generateMetadata as profileMetadata } from './profile/[username]/page'
import TagPage, { generateMetadata as tagMetadata } from './tag/[tag]/page'

/**
 * Un segment dynamique n'est **jamais** redécodé par la route qui le reçoit.
 *
 * Next.js décode déjà chaque segment avant de peupler `params` (`getRouteMatcher`,
 * App Router). Un `decodeURIComponent` de plus est un no-op tant que la valeur ne
 * contient aucun `%` littéral — et une panne dès qu'elle en contient : `50%off`,
 * `100%` ou `a%41b` sont soit rejetés par `URIError: URI malformed` (rendu serveur
 * emporté), soit silencieusement transformés (`a%41b` → `aAb`, filtre sur un tag
 * qui n'existe pas).
 *
 * Le défaut a été trouvé en revue sur les routes de profil (REQ-WEB-004 AC-8) et
 * subsistait à l'identique sur `/tag/:tag`, `/article/:slug` et `/editor/:slug`.
 * Cette suite éprouve les cinq d'un bloc, parce que c'est l'invariant — et non une
 * route en particulier — qui doit tenir : le corriger sur un seul site est ce qui
 * l'avait laissé vivre trois fois.
 *
 * Les écrans sont remplacés par des composants inertes : ce qui est vérifié est la
 * **valeur transmise**, pas ce qui en est fait, et les charger réellement ferait
 * dépendre ce test du client d'API serveur.
 */

vi.mock('./home-page', () => ({ HomePage: () => null }))
vi.mock('./profile-page', () => ({ ProfilePage: () => null }))
vi.mock('../components/ArticleView', () => ({ ArticleView: () => null }))
vi.mock('../components/ArticleEditorLoader', () => ({ ArticleEditorLoader: () => null }))

/** Le `%` d'un nom de compte que Next a déjà décodé une fois — `50%25off` en URL. */
const PERCENT_USERNAME = '50%off'
/** Un tag libre existant : `tagSchema` ne nettoie rien, `PopularTags` le lie tel quel. */
const PERCENT_TAG = '100%'
/** La variante silencieuse : un second décodage la transformerait en `aAb`. */
const AMBIGUOUS_SLUG = 'a%41b'

/**
 * Les props d'un élément React, sans passer par `as any` (rule 17).
 *
 * Les pages testées ici ne sont pas rendues : elles renvoient l'élément décrivant
 * leur écran, et c'est exactement ce qu'on veut inspecter — les props typées de
 * `ReactElement` valent `unknown` en React 19.
 */
function propsOf(element: unknown): Record<string, unknown> {
  return (element as { props: Record<string, unknown> }).props
}

const noSearchParams = Promise.resolve({})

describe('Segments dynamiques — aucun redécodage par la route', () => {
  it('/profile/:username transmet le username tel que Next l’a décodé', async () => {
    const params = Promise.resolve({ username: PERCENT_USERNAME })

    const element = await ProfileRoutePage({ params, searchParams: noSearchParams })

    expect(propsOf(element).username).toBe(PERCENT_USERNAME)
    await expect(profileMetadata({ params })).resolves.toEqual({
      title: `@${PERCENT_USERNAME} — Conduit`,
    })
  })

  it('/profile/:username/favorites transmet le même username sans le redécoder', async () => {
    const params = Promise.resolve({ username: PERCENT_USERNAME })

    const element = await FavoritesPage({ params, searchParams: noSearchParams })

    expect(propsOf(element).username).toBe(PERCENT_USERNAME)
    await expect(favoritesMetadata({ params })).resolves.toEqual({
      title: `@${PERCENT_USERNAME} — Favorited — Conduit`,
    })
  })

  it('/tag/:tag ne plante pas sur un tag terminé par `%` et filtre sur sa vraie valeur', async () => {
    // Le cas atteignable, pas théorique : `PopularTags` lie `/tag/100%25`, Next
    // redonne `100%`, et `decodeURIComponent('100%')` lève `URIError`.
    const params = Promise.resolve({ tag: PERCENT_TAG })

    const element = await TagPage({ params, searchParams: noSearchParams })

    expect(propsOf(element).tag).toBe(PERCENT_TAG)
    await expect(tagMetadata({ params })).resolves.toEqual({ title: `#${PERCENT_TAG} — Conduit` })
  })

  it('/tag/:tag ne transforme pas silencieusement `a%41b` en `aAb`', async () => {
    const params = Promise.resolve({ tag: AMBIGUOUS_SLUG })

    const element = await TagPage({ params, searchParams: noSearchParams })

    expect(propsOf(element).tag).toBe(AMBIGUOUS_SLUG)
  })

  it('/article/:slug transmet le slug tel quel', async () => {
    const params = Promise.resolve({ slug: AMBIGUOUS_SLUG })

    const element = await ArticlePage({ params })

    expect(propsOf(element).slug).toBe(AMBIGUOUS_SLUG)
    await expect(articleMetadata({ params })).resolves.toEqual({
      title: `${AMBIGUOUS_SLUG} — Conduit`,
    })
  })

  it('/editor/:slug transmet le slug tel quel', async () => {
    const params = Promise.resolve({ slug: AMBIGUOUS_SLUG })

    const element = await EditorPage({ params })

    expect(propsOf(element).slug).toBe(AMBIGUOUS_SLUG)
    await expect(editorMetadata({ params })).resolves.toEqual({
      title: `Edit ${AMBIGUOUS_SLUG} — Conduit`,
    })
  })
})
