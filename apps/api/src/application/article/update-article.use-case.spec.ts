import { describe, expect, it } from 'vitest'
import {
  AUTHOR_ID,
  anArticleProps,
  anArticleResponse,
  InMemoryArticleRepository,
  OTHER_USER_ID,
  RecordingArticleQuery,
} from '../../../test/doubles/article-doubles'
import { ArticleNotFoundError, ArticleNotOwnedError } from '../../domain/article/article.errors'
import { UpdateArticleUseCase } from './update-article.use-case'

const existing = anArticleProps()

const buildUseCase = () => {
  const articles = new InMemoryArticleRepository([existing])
  const query = new RecordingArticleQuery(anArticleResponse())
  return { useCase: new UpdateArticleUseCase(articles, query), articles, query }
}

describe('REQ-ARTICLE-005 — modifier son propre article', () => {
  it('AC-1: applique la modification partielle et conserve le reste', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute({
      slug: existing.slug.value,
      userId: AUTHOR_ID,
      changes: { description: 'So toothless' },
    })

    const persisted = articles.snapshot(existing.id)
    expect(persisted?.description).toBe('So toothless')
    expect(persisted?.title).toBe(existing.title)
    expect(persisted?.body).toBe(existing.body)
  })

  it('AC-2: régénère le slug quand le titre change', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute({
      slug: existing.slug.value,
      userId: AUTHOR_ID,
      changes: { title: 'Did you train your dragon?' },
    })

    expect(articles.snapshot(existing.id)?.slug.value).toBe('did-you-train-your-dragon')
  })

  it('AC-3: laisse le slug intact quand le titre n’est pas transmis', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute({
      slug: existing.slug.value,
      userId: AUTHOR_ID,
      changes: { body: 'You have to believe' },
    })

    expect(articles.snapshot(existing.id)?.slug.value).toBe(existing.slug.value)
  })

  it('AC-4: refuse la modification par un autre utilisateur', async () => {
    const { useCase, articles } = buildUseCase()

    await expect(
      useCase.execute({
        slug: existing.slug.value,
        userId: OTHER_USER_ID,
        changes: { title: 'Détourné' },
      })
    ).rejects.toBeInstanceOf(ArticleNotOwnedError)

    // Aucune écriture : un use-case qui modifierait avant de vérifier laisserait
    // l'article altéré malgré le refus.
    expect(articles.snapshot(existing.id)?.title).toBe(existing.title)
  })

  it('AC-5: répond « introuvable » sur un slug inconnu', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ slug: 'jamais-ecrit', userId: AUTHOR_ID, changes: { body: 'x' } })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)
  })

  it('AC-5: vérifie l’existence AVANT l’appartenance', async () => {
    // Un use-case qui testerait l'appartenance d'abord répondrait 403 sur un
    // article inexistant — ce qui affirmerait son existence — ou planterait sur
    // une valeur nulle.
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ slug: 'jamais-ecrit', userId: OTHER_USER_ID, changes: { body: 'x' } })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)
  })

  it('AC-1: dédoublonne les tags transmis', async () => {
    const { useCase, articles } = buildUseCase()

    await useCase.execute({
      slug: existing.slug.value,
      userId: AUTHOR_ID,
      changes: { tagList: ['dragons', 'dragons'] },
    })

    expect(articles.snapshot(existing.id)?.tagList).toEqual(['dragons'])
  })

  it('AC-1: relit l’article par son slug à jour, pas par celui de l’URL', async () => {
    // Après un renommage, relire le slug de l'URL renverrait « introuvable » —
    // ou pire, l'article qui aurait repris ce slug entre-temps.
    const { useCase, query } = buildUseCase()

    await useCase.execute({
      slug: existing.slug.value,
      userId: AUTHOR_ID,
      changes: { title: 'Did you train your dragon?' },
    })

    expect(query.calls.at(-1)?.slug).toBe('did-you-train-your-dragon')
    expect(query.calls.at(-1)?.viewer).toBe(AUTHOR_ID)
  })
})
