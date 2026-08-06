import { describe, expect, it } from 'vitest'
import {
  AUTHOR_ID,
  anArticleProps,
  InMemoryArticleRepository,
  OTHER_USER_ID,
} from '../../../test/doubles/article-doubles'
import { ArticleNotFoundError, ArticleNotOwnedError } from '../../domain/article/article.errors'
import { DeleteArticleUseCase } from './delete-article.use-case'

const existing = anArticleProps()

const buildUseCase = () => {
  const articles = new InMemoryArticleRepository([existing])
  return { useCase: new DeleteArticleUseCase(articles), articles }
}

describe('REQ-ARTICLE-006 — supprimer son propre article', () => {
  it('AC-1: retire l’article et ne renvoie aucun corps', async () => {
    const { useCase, articles } = buildUseCase()

    const result = await useCase.execute({ slug: existing.slug.value, userId: AUTHOR_ID })

    expect(result).toBeUndefined()
    expect(articles.snapshot(existing.id)).toBeUndefined()
    expect(articles.size).toBe(0)
  })

  it('AC-3: refuse la suppression par un autre utilisateur', async () => {
    const { useCase, articles } = buildUseCase()

    await expect(
      useCase.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })
    ).rejects.toBeInstanceOf(ArticleNotOwnedError)

    expect(articles.snapshot(existing.id)).toBeDefined()
  })

  it('AC-4: répond « introuvable » sur un slug inconnu', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ slug: 'jamais-ecrit', userId: AUTHOR_ID })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)
  })

  it('AC-4: vérifie l’existence AVANT l’appartenance', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.execute({ slug: 'jamais-ecrit', userId: OTHER_USER_ID })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)
  })

  it('AC-1: supprime par identifiant interne et propriétaire, jamais par slug seul', async () => {
    // Le slug est adressable publiquement et change au renommage ; c'est
    // l'identifiant interne qui désigne la ligne, et l'auteur qui la protège.
    // Un `deleteBySlug` sans auteur serait un IDOR (rule 19).
    const otherAuthorSameTitle = anArticleProps({ authorId: OTHER_USER_ID })
    const articles = new InMemoryArticleRepository([existing, otherAuthorSameTitle])
    const useCase = new DeleteArticleUseCase(articles)

    await useCase.execute({ slug: existing.slug.value, userId: AUTHOR_ID })

    expect(articles.snapshot(existing.id)).toBeUndefined()
    expect(articles.snapshot(otherAuthorSameTitle.id)).toBeDefined()
  })
})
