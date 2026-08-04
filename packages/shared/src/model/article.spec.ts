import { describe, expect, it } from 'vitest'
import {
  articleSchema,
  articleSummarySchema,
  articlesResponseSchema,
  createArticleDtoSchema,
  listArticlesQuerySchema,
  updateArticleDtoSchema,
} from './article'

/** Exemple verbatim du PRD §8 (« Single Article »). */
const articleFromSpec = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: {
    username: 'jake',
    bio: 'I work at statefarm',
    image: 'https://i.stack.imgur.com/xHWG8.jpg',
    following: false,
  },
}

describe('articleSchema', () => {
  it("accepte l'article verbatim de la spec", () => {
    expect(articleSchema.parse(articleFromSpec)).toEqual(articleFromSpec)
  })

  it('exige le body sur la forme unitaire', () => {
    const { body: _omitted, ...withoutBody } = articleFromSpec

    expect(articleSchema.safeParse(withoutBody).success).toBe(false)
  })

  it('refuse une date qui ne soit pas de l’ISO 8601', () => {
    expect(articleSchema.safeParse({ ...articleFromSpec, createdAt: '18/02/2016' }).success).toBe(
      false
    )
  })

  it('refuse un favoritesCount négatif', () => {
    expect(articleSchema.safeParse({ ...articleFromSpec, favoritesCount: -1 }).success).toBe(false)
  })

  it("refuse un auteur incomplet : l'article porte un Profile entier, pas un username", () => {
    expect(articleSchema.safeParse({ ...articleFromSpec, author: 'jake' }).success).toBe(false)
  })
})

describe('articleSummarySchema (règle R-7)', () => {
  it('retire le body de la forme de liste', () => {
    const { body: _omitted, ...summary } = articleFromSpec

    expect(articleSummarySchema.parse(articleFromSpec)).toEqual(summary)
  })

  it('reste valide quand le body est absent — c’est le cas nominal en liste', () => {
    const { body: _omitted, ...summary } = articleFromSpec

    expect(articleSummarySchema.safeParse(summary).success).toBe(true)
  })

  it('conserve tous les autres champs du contrat', () => {
    const parsed = articleSummarySchema.parse(articleFromSpec)

    expect(Object.keys(parsed).sort()).toEqual([
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
})

describe('articlesResponseSchema', () => {
  it("valide l'enveloppe de liste de la spec §8", () => {
    const { body: _omitted, ...summary } = articleFromSpec

    expect(articlesResponseSchema.parse({ articles: [summary], articlesCount: 2 })).toEqual({
      articles: [summary],
      articlesCount: 2,
    })
  })

  it('exige articlesCount : le front en a besoin pour paginer', () => {
    const { body: _omitted, ...summary } = articleFromSpec

    expect(articlesResponseSchema.safeParse({ articles: [summary] }).success).toBe(false)
  })
})

describe('createArticleDtoSchema', () => {
  it('accepte la création de la spec §7.3', () => {
    const creation = {
      title: 'How to train your dragon',
      description: 'Ever wonder how?',
      body: 'You have to believe',
      tagList: ['reactjs', 'angularjs', 'dragons'],
    }

    expect(createArticleDtoSchema.parse(creation)).toEqual(creation)
  })

  it('normalise tagList absent en tableau vide (aucun cas « absent » en aval)', () => {
    const parsed = createArticleDtoSchema.parse({
      title: 'How to train your dragon',
      description: 'Ever wonder how?',
      body: 'You have to believe',
    })

    expect(parsed.tagList).toEqual([])
  })

  it('refuse un titre qui ne contient que des espaces', () => {
    expect(
      createArticleDtoSchema.safeParse({ title: '   ', description: 'd', body: 'b' }).success
    ).toBe(false)
  })

  it('exige les trois champs obligatoires de la spec', () => {
    expect(createArticleDtoSchema.safeParse({ title: 'How to train your dragon' }).success).toBe(
      false
    )
  })
})

describe('updateArticleDtoSchema', () => {
  it("accepte le patch d'un seul champ, comme dans la spec §7.3", () => {
    expect(updateArticleDtoSchema.parse({ title: 'Did you train your dragon?' })).toEqual({
      title: 'Did you train your dragon?',
    })
  })

  it('refuse un titre vidé — éditer vers du vide reste une erreur de validation', () => {
    expect(updateArticleDtoSchema.safeParse({ title: '' }).success).toBe(false)
  })
})

describe('listArticlesQuerySchema', () => {
  it('hérite des défauts de pagination R-10', () => {
    expect(listArticlesQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 })
  })

  it('accepte les filtres tag, author et favorited de la spec §7.3', () => {
    expect(
      listArticlesQuerySchema.parse({
        tag: 'AngularJS',
        author: 'jake',
        favorited: 'jane',
        limit: '5',
      })
    ).toEqual({ tag: 'AngularJS', author: 'jake', favorited: 'jane', limit: 5, offset: 0 })
  })

  it('refuse un filtre auteur vide plutôt que de lister tous les articles', () => {
    expect(listArticlesQuerySchema.safeParse({ author: '  ' }).success).toBe(false)
  })
})
