import { describe, expect, it } from 'vitest'
import {
  AUTHOR_ID,
  anArticleResponse,
  InMemoryArticleRepository,
  OTHER_USER_ID,
  RecordingArticleQuery,
} from '../../../test/doubles/article-doubles'
import { type CreateArticleInput, CreateArticleUseCase } from './create-article.use-case'

const buildUseCase = () => {
  const articles = new InMemoryArticleRepository()
  const query = new RecordingArticleQuery(anArticleResponse())
  return { useCase: new CreateArticleUseCase(articles, query), articles, query }
}

const aRequest = (overrides: Record<string, unknown> = {}) => ({
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'You have to believe',
  tagList: ['dragons', 'training'],
  authorId: AUTHOR_ID,
  ...overrides,
})

describe('REQ-ARTICLE-003 — publier un article', () => {
  it('AC-1: persiste l’article et le renvoie au format du contrat', async () => {
    const { useCase, articles } = buildUseCase()

    const article = await useCase.execute(aRequest())

    expect(articles.size).toBe(1)
    expect(article.title).toBe('How to train your dragon')
    expect(article.body).toBeDefined()
  })

  it('AC-1: attribue l’article au porteur du jeton', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute(aRequest())

    expect(articles.all()[0]?.authorId).toBe(AUTHOR_ID)
  })

  it('AC-4: ignore un auteur soufflé par la requête', async () => {
    // Server-side authority (rule 19) : le use-case ne lit l'auteur que dans son
    // propre input, alimenté par le jeton vérifié. Un champ homonyme venu du
    // corps ne doit avoir aucun effet — sans quoi n'importe qui publierait au
    // nom d'un autre.
    const { useCase, articles } = buildUseCase()

    // Le double cast simule un corps de requête porteur de clés que le type
    // d'entrée ne déclare pas — exactement ce qu'un client malveillant envoie,
    // et ce que TypeScript ne peut pas empêcher au runtime.
    const polluted = {
      ...aRequest(),
      author: OTHER_USER_ID,
      slug: 'choisi-par-le-client',
    } as unknown as CreateArticleInput

    await useCase.execute(polluted)

    expect(articles.all()[0]?.authorId).toBe(AUTHOR_ID)
    expect(articles.all()[0]?.slug.value).toBe('how-to-train-your-dragon')
  })

  it('AC-2: dérive le slug du titre', async () => {
    const { useCase, query } = buildUseCase()

    await useCase.execute(aRequest())

    expect(query.calls.at(-1)?.slug).toBe('how-to-train-your-dragon')
  })

  it('AC-3: suffixe le slug du second article au titre identique', async () => {
    const { useCase, query } = buildUseCase()

    await useCase.execute(aRequest())
    await useCase.execute(aRequest())

    expect(query.calls.map((call) => call.slug)).toEqual([
      'how-to-train-your-dragon',
      'how-to-train-your-dragon-2',
    ])
  })

  it('AC-3: relit le slug réellement retenu, pas celui proposé', async () => {
    // Un use-case qui relirait `Slug.fromTitle(title)` renverrait le PREMIER
    // article à qui vient d'en créer un second sous le même titre — la réponse
    // décrirait l'article de quelqu'un d'autre.
    const { useCase, query } = buildUseCase()

    await useCase.execute(aRequest())
    const second = await useCase.execute(aRequest())

    expect(second.slug).toBe('how-to-train-your-dragon-2')
    expect(query.calls.at(-1)?.slug).toBe('how-to-train-your-dragon-2')
  })

  it('AC-5: dédoublonne les tags avant de persister', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute(aRequest({ tagList: ['dragons', 'dragons', 'training'] }))

    expect(articles.all()[0]?.tagList).toEqual(['dragons', 'training'])
  })

  it('AC-5: préserve l’ordre de saisie des tags conservés', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute(aRequest({ tagList: ['training', 'dragons', 'training'] }))

    expect(articles.all()[0]?.tagList).toEqual(['training', 'dragons'])
  })

  it('AC-1: transmet le lecteur au port de lecture pour produire la réponse', async () => {
    // Sans le lecteur, `favorited` et `author.following` vaudraient false pour
    // tout le monde — une réponse parfaitement valide et pourtant fausse (R-5).
    const { useCase, query } = buildUseCase()

    await useCase.execute(aRequest())

    expect(query.calls.at(-1)?.viewer).toBe(AUTHOR_ID)
  })
})
