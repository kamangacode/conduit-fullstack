import { describe, expect, it } from 'vitest'
import {
  AUTHOR_ID,
  anArticleProps,
  anArticleResponse,
  InMemoryArticleRepository,
  InMemoryFavoriteRepository,
  OTHER_USER_ID,
  RecordingArticleQuery,
} from '../../../test/doubles/article-doubles'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import { FavoriteArticleUseCase } from './favorite-article.use-case'
import { UnfavoriteArticleUseCase } from './unfavorite-article.use-case'

const existing = anArticleProps()

const build = (seed: Array<[string, string]> = []) => {
  const articles = new InMemoryArticleRepository([existing])
  const favorites = new InMemoryFavoriteRepository(seed)
  const query = new RecordingArticleQuery(anArticleResponse())
  return {
    favorite: new FavoriteArticleUseCase(articles, favorites, query),
    unfavorite: new UnfavoriteArticleUseCase(articles, favorites, query),
    favorites,
    query,
  }
}

describe('REQ-ARTICLE-009 — favoriser et défavoriser un article', () => {
  it('AC-1: enregistre le favori et renvoie l’article', async () => {
    const { favorite, favorites } = build()

    const article = await favorite.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })

    expect(favorites.has(OTHER_USER_ID, existing.id)).toBe(true)
    expect(article.slug).toBe(existing.slug.value)
  })

  it('AC-2: reste idempotent — favoriser deux fois ne crée pas de doublon', async () => {
    const { favorite, favorites } = build()

    await favorite.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })
    await favorite.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })

    expect(favorites.size).toBe(1)
  })

  it('AC-2: n’échoue pas quand le favori existe déjà', async () => {
    const { favorite } = build([[OTHER_USER_ID, existing.id]])

    await expect(
      favorite.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })
    ).resolves.toBeDefined()
  })

  it('AC-3: retire le favori', async () => {
    const { unfavorite, favorites } = build([[OTHER_USER_ID, existing.id]])

    await unfavorite.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })

    expect(favorites.has(OTHER_USER_ID, existing.id)).toBe(false)
  })

  it('AC-4: reste idempotent — défavoriser ce qui ne l’était pas est un succès', async () => {
    const { unfavorite, favorites } = build()

    await expect(
      unfavorite.execute({ slug: existing.slug.value, userId: OTHER_USER_ID })
    ).resolves.toBeDefined()
    expect(favorites.size).toBe(0)
  })

  it('AC-5: ne calcule jamais favoritesCount lui-même', async () => {
    // Le compteur vient du port de lecture, qui l'agrège sur TOUS les lecteurs.
    // Un use-case qui l'incrémenterait localement renverrait 1 pour un article
    // favorisé par cinquante personnes — et ne pourrait jamais devenir négatif
    // pour la seule raison qu'on l'aurait borné.
    const { favorite, query } = build()

    const article = await favorite.execute({
      slug: existing.slug.value,
      userId: OTHER_USER_ID,
    })

    expect(article.favoritesCount).toBe(anArticleResponse().favoritesCount)
    expect(query.calls.at(-1)?.viewer).toBe(OTHER_USER_ID)
  })

  it('AC-7: répond « introuvable » sur un slug inconnu, sans rien écrire', async () => {
    const { favorite, favorites } = build()

    await expect(
      favorite.execute({ slug: 'jamais-ecrit', userId: OTHER_USER_ID })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)

    // Une écriture avant résolution laisserait un favori orphelin, pointant un
    // article qui n'existe pas.
    expect(favorites.writes).toBe(0)
  })

  it('AC-7: répond « introuvable » aussi au défavori d’un slug inconnu', async () => {
    const { unfavorite, favorites } = build()

    await expect(
      unfavorite.execute({ slug: 'jamais-ecrit', userId: OTHER_USER_ID })
    ).rejects.toBeInstanceOf(ArticleNotFoundError)
    expect(favorites.writes).toBe(0)
  })

  it('AC-1: rien n’interdit à l’auteur de favoriser son propre article', async () => {
    // Le contrat ne l'exclut pas ; l'interdire créerait un cas particulier que
    // les autres implémentations Conduit n'ont pas.
    const { favorite, favorites } = build()

    await favorite.execute({ slug: existing.slug.value, userId: AUTHOR_ID })

    expect(favorites.has(AUTHOR_ID, existing.id)).toBe(true)
  })
})
