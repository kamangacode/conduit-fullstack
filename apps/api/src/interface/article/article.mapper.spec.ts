import { describe, expect, it } from 'vitest'
import type { ArticleView } from '../../domain/article/ports/article-view'
import { toArticle, toArticleSummary, toArticlesResponse } from './article.mapper'

/**
 * Le format §8 était produit par le type même du port de lecture, qui renvoyait
 * directement `Article` et `ArticleSummary` du contrat. Depuis l'ADR 031 il est
 * produit ici, et c'est ici qu'il doit être asserté : un écart de forme ne
 * casserait plus la compilation des couches du dessous.
 */

const aView = (overrides: Partial<ArticleView> = {}): ArticleView => ({
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons', 'training'],
  createdAt: new Date('2016-02-18T03:22:56.637Z'),
  updatedAt: new Date('2016-02-18T03:48:35.824Z'),
  favorited: false,
  favoritesCount: 3,
  author: { username: 'jake', bio: null, image: null, following: false },
  ...overrides,
})

describe('REQ-ARTICLE-004 — forme de l’article unitaire (PRD §8)', () => {
  it('AC-1: sérialise les horodatages en ISO 8601', () => {
    // Le read model porte des `Date`. La chaîne du fil naît ici, et nulle part
    // ailleurs : c'est la contrepartie du découplage, et la seule assertion qui
    // la couvre.
    const article = toArticle(aView())

    expect(article.createdAt).toBe('2016-02-18T03:22:56.637Z')
    expect(article.updatedAt).toBe('2016-02-18T03:48:35.824Z')
  })

  it('AC-1: produit exactement les clés du contrat, sans identifiant interne', () => {
    expect(Object.keys(toArticle(aView())).sort()).toEqual([
      'author',
      'body',
      'createdAt',
      'description',
      'favorited',
      'favoritesCount',
      'slug',
      'tagList',
      'title',
      'updatedAt',
    ])
  })

  it('AC-1: recopie `tagList` au lieu de partager le tableau du read model', () => {
    // Sans la copie, un appelant peut muter la projection que la couche du
    // dessous vient de produire. Le typage `readonly` protège la source, pas la
    // sortie.
    const view = aView()
    const article = toArticle(view)

    expect(article.tagList).not.toBe(view.tagList)
    expect(article.tagList).toEqual(['dragons', 'training'])
  })
})

describe('REQ-ARTICLE-007 — forme de la liste (R-7 et AC-3)', () => {
  it('AC-1: le résumé omet `body`, et rien d’autre', () => {
    const summary = toArticleSummary(aView())

    expect(summary).not.toHaveProperty('body')
    expect(Object.keys(summary).sort()).toEqual([
      'author',
      'createdAt',
      'description',
      'favorited',
      'favoritesCount',
      'slug',
      'tagList',
      'title',
      'updatedAt',
    ])
  })

  it('AC-3: `articlesCount` est le total avant pagination, pas la taille de la tranche', () => {
    // Le mode de panne que ce test ferme : renvoyer `articles.length`. Les deux
    // coïncident tant qu'on teste avec moins d'articles qu'une page, ce qui rend
    // l'erreur invisible en développement. Ici la page porte 1 élément pour un
    // total de 47, donc la confusion est visible.
    const response = toArticlesResponse({ items: [aView()], total: 47 })

    expect(response.articles).toHaveLength(1)
    expect(response.articlesCount).toBe(47)
  })

  it('AC-1: une page vide produit une enveloppe conforme, pas une réponse vide', () => {
    expect(toArticlesResponse({ items: [], total: 0 })).toEqual({
      articles: [],
      articlesCount: 0,
    })
  })
})
