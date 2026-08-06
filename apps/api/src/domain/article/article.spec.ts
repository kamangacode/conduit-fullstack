import { describe, expect, it } from 'vitest'
import { ArticleEntity, type ArticleProps } from './article'
import { ArticleNotOwnedError } from './article.errors'
import { Slug } from './slug'

/** Tests unitaires du domaine : zéro mock, zéro I/O (rule 16). */

const AUTHOR_ID = 'c0ffee00-0000-4000-8000-000000000001'
const OTHER_USER_ID = 'c0ffee00-0000-4000-8000-000000000002'

const baseProps: ArticleProps = {
  id: 'a1710000-0000-4000-8000-000000000001',
  slug: Slug.fromTitle('How to train your dragon'),
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons', 'training'],
  authorId: AUTHOR_ID,
  createdAt: new Date('2016-02-18T03:22:56.637Z'),
  updatedAt: new Date('2016-02-18T03:48:35.824Z'),
}

const anArticle = (overrides: Partial<ArticleProps> = {}): ArticleEntity =>
  ArticleEntity.fromProps({ ...baseProps, ...overrides })

describe('REQ-ARTICLE-005 — modification partielle d’un article', () => {
  it('AC-1: conserve les champs non transmis', () => {
    const updated = anArticle().withChanges({ description: 'So toothless' })

    expect(updated.description).toBe('So toothless')
    expect(updated.title).toBe(baseProps.title)
    expect(updated.body).toBe(baseProps.body)
    expect(updated.tagList).toEqual(baseProps.tagList)
  })

  it('AC-1: renvoie une nouvelle instance sans muter l’originale', () => {
    const article = anArticle()
    const updated = article.withChanges({ title: 'Did you train your dragon?' })

    expect(updated).not.toBe(article)
    expect(article.title).toBe(baseProps.title)
  })

  it('AC-2: régénère le slug quand le titre change', () => {
    const updated = anArticle().withChanges({ title: 'Did you train your dragon?' })

    expect(updated.slug.value).toBe('did-you-train-your-dragon')
  })

  it('AC-3: laisse le slug intact quand le titre n’est pas transmis', () => {
    // Régénérer « au cas où » casserait toutes les URL d'un article dont on ne
    // corrige qu'une faute dans la description. Rien ne l'oblige — c'est
    // simplement ce que produit le code le plus court.
    const updated = anArticle().withChanges({ body: 'You have to believe' })

    expect(updated.slug.value).toBe('how-to-train-your-dragon')
  })

  it('AC-3: laisse le slug intact quand le titre est renvoyé identique', () => {
    // Le piège que ce test ferme : sur un article dont le slug porte un suffixe
    // de collision, régénérer sur un titre inchangé effacerait ce suffixe. Le
    // slug reviendrait à sa forme de base — celle d'un AUTRE article — et l'URL
    // changerait alors que rien n'a bougé.
    const collided = anArticle({ slug: Slug.fromPersisted('how-to-train-your-dragon-2') })

    const updated = collided.withChanges({ title: baseProps.title })

    expect(updated.slug.value).toBe('how-to-train-your-dragon-2')
  })

  it('AC-4: refuse la modification par un autre utilisateur', () => {
    expect(() => anArticle().assertEditableBy(OTHER_USER_ID)).toThrow(ArticleNotOwnedError)
  })

  it('AC-4: laisse passer l’auteur', () => {
    expect(() => anArticle().assertEditableBy(AUTHOR_ID)).not.toThrow()
  })

  it('AC-1: ne touche pas aux horodatages, produits par la persistance', () => {
    // Une entité qui lirait l'horloge ne serait plus testable sans la piloter,
    // et divergerait de `@updatedAt` — deux vérités pour une même date.
    const updated = anArticle().withChanges({ title: 'Did you train your dragon?' })

    expect(updated.createdAt).toEqual(baseProps.createdAt)
    expect(updated.updatedAt).toEqual(baseProps.updatedAt)
  })
})

describe('REQ-ARTICLE-006 — appartenance de l’article', () => {
  it('AC-3: reconnaît l’auteur et lui seul', () => {
    const article = anArticle()

    expect(article.isAuthoredBy(AUTHOR_ID)).toBe(true)
    expect(article.isAuthoredBy(OTHER_USER_ID)).toBe(false)
  })

  it('AC-3: signale l’interdiction par une erreur métier, sans code HTTP', () => {
    // Le domaine dit « cet article n'est pas le tien » ; c'est l'infrastructure
    // qui en fait un 403 (rule 12). Un statut écrit ici serait du transport
    // ayant fui dans le métier.
    try {
      anArticle().assertEditableBy(OTHER_USER_ID)
      expect.unreachable('assertEditableBy aurait dû lever')
    } catch (error) {
      expect(error).toBeInstanceOf(ArticleNotOwnedError)
      expect((error as ArticleNotOwnedError).errorCode).toBe('forbidden')
    }
  })
})
