import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Env } from '@/config/env'
import { Slug } from '@/domain/article/slug'
import { PrismaArticleQuery } from '@/infrastructure/persistence/prisma-article.query'
import { PrismaArticleRepository } from '@/infrastructure/persistence/prisma-article.repository'
import {
  PrismaCommentQuery,
  PrismaCommentRepository,
} from '@/infrastructure/persistence/prisma-comment.repository'
import { PrismaFavoriteRepository } from '@/infrastructure/persistence/prisma-favorite.repository'
import { PrismaTagQuery } from '@/infrastructure/persistence/prisma-tag.query'
import { PrismaService } from '@/infrastructure/prisma/prisma.service'
import { prismaTestClient } from './setup'

/**
 * Adapters de la slice F3 contre une **vraie** PostgreSQL (rule 16).
 *
 * C'est la seule lane où la projection décrite par l'ADR 011 est vérifiable :
 * `following`, `favorited` et `favoritesCount` sont produits par des jointures
 * et un agrégat, pas par du TypeScript. Une doublure en mémoire ne pourrait que
 * réimplémenter ces règles — et le test prouverait alors la doublure.
 *
 * Trois familles de propriétés se jouent ici, et aucune ailleurs :
 *
 * - la **résolution du slug** repose sur la contrainte `@unique` réelle, pas sur
 *   une convention de code (ADR 010) ;
 * - le **filtrage par propriétaire** vit dans la clause `where`, donc dans le
 *   moteur (rule 19) ;
 * - la **cascade** de suppression est déclarée au schéma : rien dans le code
 *   applicatif ne la met en œuvre, donc rien d'autre ne peut l'attester.
 */

const env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: process.env.DATABASE_URL as string,
  JWT_SECRET: 'non-utilise-par-la-persistance-32c',
  JWT_EXPIRES_IN: '7d',
} as Env

const prisma = new PrismaService(env)
const articles = new PrismaArticleRepository(prisma)
const query = new PrismaArticleQuery(prisma)
const favorites = new PrismaFavoriteRepository(prisma)
const comments = new PrismaCommentRepository(prisma)
const commentQuery = new PrismaCommentQuery(prisma)
const tags = new PrismaTagQuery(prisma)

afterAll(async () => {
  await prisma.$disconnect()
})

const PAGE = { limit: 20, offset: 0 }

let jake: string
let jacob: string

/** Deux comptes fraîchement créés à chaque test — la base est purgée entre eux. */
beforeEach(async () => {
  const [first, second] = await Promise.all([
    prismaTestClient.user.create({
      data: { email: 'jake@jake.jake', username: 'jake', passwordHash: 'hash' },
    }),
    prismaTestClient.user.create({
      data: { email: 'jacob@jake.jake', username: 'jacob', passwordHash: 'hash' },
    }),
  ])
  jake = first.id
  jacob = second.id
})

const newArticle = (overrides: Partial<{ title: string; tagList: string[] }> = {}) => {
  const title = overrides.title ?? 'How to train your dragon'
  return {
    slug: Slug.fromTitle(title),
    title,
    description: 'Ever wonder how?',
    body: 'It takes a Jacobian',
    tagList: overrides.tagList ?? ['dragons', 'training'],
    authorId: jake,
  }
}

/**
 * Sème un article à une date précise, pour les propriétés d'ordre.
 *
 * Passe par le client brut plutôt que par le repository : deux `create`
 * successifs porteraient des `createdAt` trop proches pour rendre un tri
 * déterministe, et le tri est justement ce qu'on veut prouver (R-2).
 */
const seedArticleAt = async (title: string, createdAt: string, authorId: string) =>
  prismaTestClient.article.create({
    data: {
      slug: Slug.fromTitle(title).value,
      title,
      description: 'd',
      body: 'b',
      authorId,
      createdAt: new Date(createdAt),
    },
  })

describe('REQ-ARTICLE-003 — persistance de la publication', () => {
  it('AC-3: suffixe le slug du second article au titre identique', async () => {
    // La contrainte @unique réelle arbitre : aucun SELECT préalable n'est fait,
    // et c'est PostgreSQL qui refuse le doublon (ADR 010).
    const first = await articles.create(newArticle())
    const second = await articles.create(newArticle())

    expect(first.slug.value).toBe('how-to-train-your-dragon')
    expect(second.slug.value).toBe('how-to-train-your-dragon-2')
  })

  it('AC-3: continue à suffixer au-delà du deuxième homonyme', async () => {
    await articles.create(newArticle())
    await articles.create(newArticle())
    const third = await articles.create(newArticle())

    // Et non « …-2-3 » : chaque tentative repart du slug de base.
    expect(third.slug.value).toBe('how-to-train-your-dragon-3')
  })

  it('AC-5: réutilise un tag existant au lieu de le recréer', async () => {
    await articles.create(newArticle({ title: 'Premier', tagList: ['dragons'] }))
    await articles.create(newArticle({ title: 'Second', tagList: ['dragons', 'training'] }))

    const rows = await prismaTestClient.tag.findMany({ where: { name: 'dragons' } })

    // Un tag recréé à chaque article ferait diverger la liste des tags de la
    // réalité des articles — et la contrainte d'unicité sur `name` ferait
    // échouer la seconde publication.
    expect(rows).toHaveLength(1)
  })
})

describe('REQ-ARTICLE-004 — projection de l’article unitaire', () => {
  it('AC-1: rend favorited et following à false pour un anonyme', async () => {
    const created = await articles.create(newArticle())

    const article = await query.findBySlug(created.slug, null)

    expect(article?.favorited).toBe(false)
    expect(article?.author.following).toBe(false)
  })

  it('AC-2: calcule favorited et following relativement au lecteur', async () => {
    const created = await articles.create(newArticle())
    await favorites.favorite(jacob, created.id)
    await prismaTestClient.follow.create({ data: { followerId: jacob, followingId: jake } })

    const forJacob = await query.findBySlug(created.slug, jacob)
    const forAnonymous = await query.findBySlug(created.slug, null)

    expect(forJacob?.favorited).toBe(true)
    expect(forJacob?.author.following).toBe(true)
    // La même ressource, deux réponses : c'est la définition de R-5.
    expect(forAnonymous?.favorited).toBe(false)
    expect(forAnonymous?.author.following).toBe(false)
  })

  it('AC-2: compte tous les favoris, pas seulement celui du lecteur', async () => {
    const created = await articles.create(newArticle())
    await favorites.favorite(jake, created.id)
    await favorites.favorite(jacob, created.id)

    const forJacob = await query.findBySlug(created.slug, jacob)

    // Dériver le compteur du lecteur renverrait 1 pour un article favorisé par
    // cinquante personnes.
    expect(forJacob?.favoritesCount).toBe(2)
    expect(forJacob?.favorited).toBe(true)
  })

  it('AC-4: ne laisse sortir aucun identifiant interne', async () => {
    const created = await articles.create(newArticle())

    const article = await query.findBySlug(created.slug, null)
    const serialized = JSON.stringify(article)

    expect(serialized).not.toContain(created.id)
    expect(serialized).not.toContain(jake)
    expect(serialized).not.toContain('jake@jake.jake')
  })

  it('AC-3: rend null sur un slug inconnu', async () => {
    expect(await query.findBySlug(Slug.fromPersisted('jamais-ecrit'), null)).toBeNull()
  })
})

describe('REQ-ARTICLE-005 — persistance de la modification', () => {
  it('AC-4: refuse de modifier l’article d’un autre, par la clause where', async () => {
    const created = await articles.create(newArticle())

    // Le filtrage est dans la requête : pour PostgreSQL, la ligne « article de
    // jake appartenant à jacob » n'existe pas (rule 19, anti-IDOR).
    await expect(
      articles.update(jacob, created.withChanges({ title: 'Détourné' }))
    ).rejects.toThrow()

    const untouched = await prismaTestClient.article.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(untouched.title).toBe('How to train your dragon')
  })

  it('AC-1: remplace la liste de tags au lieu de l’enrichir', async () => {
    const created = await articles.create(newArticle({ tagList: ['dragons', 'training'] }))

    const updated = await articles.update(jake, created.withChanges({ tagList: ['reactjs'] }))

    expect([...updated.tagList]).toEqual(['reactjs'])
  })

  it('AC-2: persiste le nouveau slug quand le titre change', async () => {
    // Ce test a d'abord été écrit d'après l'implémentation, donc à l'envers : il
    // affirmait que le slug ne bougeait pas, et passait. Le défaut qu'il
    // masquait était réel — le repository n'écrivait pas le slug régénéré, et un
    // article renommé gardait son ancienne URL, contre R-1 et la spec.
    const created = await articles.create(newArticle())

    const updated = await articles.update(
      jake,
      created.withChanges({ title: 'Did you train your dragon?' })
    )

    expect(updated.slug.value).toBe('did-you-train-your-dragon')
    expect(
      await query.findBySlug(Slug.fromPersisted('did-you-train-your-dragon'), null)
    ).not.toBeNull()
    // L'ancienne URL cesse de répondre : c'est le comportement exigé par la
    // spec, et aucune redirection n'est prévue (ADR 010, Consequences).
    expect(await query.findBySlug(Slug.fromPersisted('how-to-train-your-dragon'), null)).toBeNull()
  })

  it('AC-3: laisse le slug intact quand le titre ne change pas', async () => {
    const created = await articles.create(newArticle())

    const updated = await articles.update(jake, created.withChanges({ body: 'Autre corps' }))

    expect(updated.slug.value).toBe('how-to-train-your-dragon')
  })

  it('AC-2: suffixe le slug renommé s’il entre en collision', async () => {
    // Le renommage retombe sur la même résolution que la création : la
    // contrainte arbitre, l'adapter suffixe (ADR 010).
    await articles.create(newArticle({ title: 'Deja pris' }))
    const other = await articles.create(newArticle({ title: 'Autre titre' }))

    const updated = await articles.update(jake, other.withChanges({ title: 'Deja pris' }))

    expect(updated.slug.value).toBe('deja-pris-2')
  })
})

describe('REQ-ARTICLE-006 — persistance de la suppression', () => {
  it('AC-3: refuse de supprimer l’article d’un autre', async () => {
    const created = await articles.create(newArticle())

    await expect(articles.delete(created.id, jacob)).rejects.toThrow()

    expect(await prismaTestClient.article.count()).toBe(1)
  })

  it('AC-2: emporte les commentaires et les favoris par cascade', async () => {
    const created = await articles.create(newArticle())
    await comments.create({ body: 'un commentaire', articleId: created.id, authorId: jacob })
    await favorites.favorite(jacob, created.id)

    await articles.delete(created.id, jake)

    // La cascade est déclarée au schéma : aucun code applicatif ne l'exécute,
    // donc rien d'autre que ce test ne peut attester qu'elle est en place.
    expect(await prismaTestClient.comment.count()).toBe(0)
    expect(await prismaTestClient.favorite.count()).toBe(0)
  })
})

describe('REQ-ARTICLE-007 — listing, filtres et pagination', () => {
  it('AC-1: trie du plus récent au plus ancien', async () => {
    await seedArticleAt('Ancien', '2016-01-01T00:00:00.000Z', jake)
    await seedArticleAt('Recent', '2016-06-01T00:00:00.000Z', jake)

    const page = await query.list(PAGE, null)

    expect(page.items.map((item) => item.title)).toEqual(['Recent', 'Ancien'])
  })

  it('AC-2: omet le body de la forme de liste', async () => {
    await articles.create(newArticle())

    const page = await query.list(PAGE, null)

    expect(page.items[0]).not.toHaveProperty('body')
  })

  it('AC-3: rend le total AVANT pagination, pas la taille de la page', async () => {
    await seedArticleAt('Un', '2016-01-01T00:00:00.000Z', jake)
    await seedArticleAt('Deux', '2016-02-01T00:00:00.000Z', jake)
    await seedArticleAt('Trois', '2016-03-01T00:00:00.000Z', jake)

    const page = await query.list({ limit: 2, offset: 0 }, null)

    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(3)
  })

  it('AC-3: décale la fenêtre avec offset', async () => {
    await seedArticleAt('Un', '2016-01-01T00:00:00.000Z', jake)
    await seedArticleAt('Deux', '2016-02-01T00:00:00.000Z', jake)
    await seedArticleAt('Trois', '2016-03-01T00:00:00.000Z', jake)

    const page = await query.list({ limit: 2, offset: 2 }, null)

    expect(page.items.map((item) => item.title)).toEqual(['Un'])
    expect(page.total).toBe(3)
  })

  it('AC-4: filtre par tag', async () => {
    await articles.create(newArticle({ title: 'Avec dragons', tagList: ['dragons'] }))
    await articles.create(newArticle({ title: 'Avec react', tagList: ['reactjs'] }))

    const page = await query.list({ ...PAGE, tag: 'dragons' }, null)

    expect(page.items.map((item) => item.title)).toEqual(['Avec dragons'])
    expect(page.total).toBe(1)
  })

  it('AC-5: distingue « écrit par » de « favorisé par »', async () => {
    const written = await articles.create(newArticle({ title: 'Ecrit par jake' }))
    await prismaTestClient.article.create({
      data: {
        slug: 'ecrit-par-jacob',
        title: 'Ecrit par jacob',
        description: 'd',
        body: 'b',
        authorId: jacob,
      },
    })
    // jacob favorise l'article de jake : les deux filtres doivent diverger.
    await favorites.favorite(jacob, written.id)

    const byAuthor = await query.list({ ...PAGE, author: 'jacob' }, null)
    const byFavorite = await query.list({ ...PAGE, favoritedBy: 'jacob' }, null)

    expect(byAuthor.items.map((item) => item.title)).toEqual(['Ecrit par jacob'])
    expect(byFavorite.items.map((item) => item.title)).toEqual(['Ecrit par jake'])
  })

  it('AC-6: cumule les filtres en conjonction', async () => {
    await articles.create(newArticle({ title: 'Jake et dragons', tagList: ['dragons'] }))
    await articles.create(newArticle({ title: 'Jake et react', tagList: ['reactjs'] }))

    const page = await query.list({ ...PAGE, tag: 'dragons', author: 'jake' }, null)

    expect(page.items.map((item) => item.title)).toEqual(['Jake et dragons'])
  })

  it('AC-8: rend une page vide sur un filtre qui ne désigne personne', async () => {
    await articles.create(newArticle())

    const page = await query.list({ ...PAGE, author: 'fantome' }, null)

    // Et surtout pas le catalogue entier, qui serait la conséquence d'un filtre
    // silencieusement ignoré.
    expect(page.items).toEqual([])
    expect(page.total).toBe(0)
  })

  it('AC-7: calcule favorited par article relativement au lecteur', async () => {
    const favorised = await articles.create(newArticle({ title: 'Favorise' }))
    await articles.create(newArticle({ title: 'Ignore' }))
    await favorites.favorite(jacob, favorised.id)

    const page = await query.list(PAGE, jacob)
    const byTitle = new Map(page.items.map((item) => [item.title, item.favorited]))

    expect(byTitle.get('Favorise')).toBe(true)
    expect(byTitle.get('Ignore')).toBe(false)
  })
})

describe('REQ-ARTICLE-008 — flux personnel', () => {
  it('AC-1: ne renvoie que les articles des auteurs suivis', async () => {
    await seedArticleAt('De jake', '2016-01-01T00:00:00.000Z', jake)
    await seedArticleAt('De jacob', '2016-02-01T00:00:00.000Z', jacob)
    await prismaTestClient.follow.create({ data: { followerId: jacob, followingId: jake } })

    const feed = await query.feed(PAGE, jacob)

    expect(feed.items.map((item) => item.title)).toEqual(['De jake'])
    expect(feed.total).toBe(1)
  })

  it('AC-2: n’inclut pas les articles du lecteur lui-même', async () => {
    await seedArticleAt('De jacob', '2016-02-01T00:00:00.000Z', jacob)

    const feed = await query.feed(PAGE, jacob)

    // On ne figure pas dans sa propre liste d'abonnements.
    expect(feed.items).toEqual([])
  })

  it('AC-5: rend following à true pour tous les auteurs du flux', async () => {
    await seedArticleAt('De jake', '2016-01-01T00:00:00.000Z', jake)
    await prismaTestClient.follow.create({ data: { followerId: jacob, followingId: jake } })

    const feed = await query.feed(PAGE, jacob)

    expect(feed.items[0]?.author.following).toBe(true)
  })

  it('AC-6: retire les articles dès le désabonnement, sans rien avoir recopié', async () => {
    await seedArticleAt('De jake', '2016-01-01T00:00:00.000Z', jake)
    await prismaTestClient.follow.create({ data: { followerId: jacob, followingId: jake } })
    expect((await query.feed(PAGE, jacob)).items).toHaveLength(1)

    await prismaTestClient.follow.deleteMany({ where: { followerId: jacob, followingId: jake } })

    // Un flux alimenté par recopie à l'abonnement (fan-out à l'écriture)
    // passerait le test précédent et échouerait ici.
    expect((await query.feed(PAGE, jacob)).items).toEqual([])
  })
})

describe('REQ-ARTICLE-009 — favoris', () => {
  it('AC-2: favoriser deux fois ne crée qu’une ligne', async () => {
    const created = await articles.create(newArticle())

    await favorites.favorite(jacob, created.id)
    await favorites.favorite(jacob, created.id)

    expect(await prismaTestClient.favorite.count()).toBe(1)
    expect((await query.findBySlug(created.slug, jacob))?.favoritesCount).toBe(1)
  })

  it('AC-4: défavoriser ce qui ne l’était pas ne lève pas', async () => {
    const created = await articles.create(newArticle())

    await expect(favorites.unfavorite(jacob, created.id)).resolves.toBeUndefined()
    expect((await query.findBySlug(created.slug, jacob))?.favoritesCount).toBe(0)
  })

  it('AC-3: le compteur redescend après un défavori', async () => {
    const created = await articles.create(newArticle())
    await favorites.favorite(jake, created.id)
    await favorites.favorite(jacob, created.id)

    await favorites.unfavorite(jacob, created.id)

    const article = await query.findBySlug(created.slug, jacob)
    // Recalculé depuis la table, jamais décrémenté : il ne peut pas dériver.
    expect(article?.favoritesCount).toBe(1)
    expect(article?.favorited).toBe(false)
  })
})

describe('REQ-COMMENT-002 — persistance du commentaire', () => {
  it('AC-2: attribue un identifiant entier', async () => {
    const created = await articles.create(newArticle())

    const comment = await comments.create({
      body: 'His name was my name too.',
      articleId: created.id,
      authorId: jacob,
    })

    // Preuve de la migration `comment_id_integer` (ADR 004) : avant elle, la
    // colonne rendait un UUID et cette assertion échouait.
    expect(Number.isInteger(comment.id)).toBe(true)
    expect(comment.id).toBeGreaterThan(0)
  })
})

describe('REQ-COMMENT-003 — lecture des commentaires', () => {
  it('AC-3: résout l’auteur en profil complet, following compris', async () => {
    const created = await articles.create(newArticle())
    await comments.create({ body: 'un', articleId: created.id, authorId: jake })
    await prismaTestClient.follow.create({ data: { followerId: jacob, followingId: jake } })

    const list = await commentQuery.listByArticle(created.id, jacob)

    expect(list[0]?.author.username).toBe('jake')
    expect(list[0]?.author.following).toBe(true)
  })

  it('AC-2: rend une liste vide sur un article sans commentaire', async () => {
    const created = await articles.create(newArticle())

    expect(await commentQuery.listByArticle(created.id, null)).toEqual([])
  })
})

describe('REQ-COMMENT-004 — suppression du commentaire', () => {
  it('AC-2: refuse la suppression par un autre que l’auteur, par la clause where', async () => {
    const created = await articles.create(newArticle())
    const comment = await comments.create({
      body: 'un',
      articleId: created.id,
      authorId: jacob,
    })

    await expect(comments.delete(comment.id, jake)).rejects.toThrow()

    expect(await prismaTestClient.comment.count()).toBe(1)
  })

  it('AC-1: supprime le commentaire de son auteur', async () => {
    const created = await articles.create(newArticle())
    const comment = await comments.create({
      body: 'un',
      articleId: created.id,
      authorId: jacob,
    })

    await comments.delete(comment.id, jacob)

    expect(await prismaTestClient.comment.count()).toBe(0)
  })
})

describe('REQ-TAG-002 — tags réellement utilisés', () => {
  it('AC-2: ne rend qu’une occurrence d’un tag porté par plusieurs articles', async () => {
    await articles.create(newArticle({ title: 'Premier', tagList: ['dragons'] }))
    await articles.create(newArticle({ title: 'Second', tagList: ['dragons'] }))

    expect(await tags.listUsed()).toEqual(['dragons'])
  })

  it('AC-4: cesse de proposer un tag dont le dernier article a disparu', async () => {
    const created = await articles.create(newArticle({ tagList: ['dragons'] }))
    expect(await tags.listUsed()).toEqual(['dragons'])

    await articles.delete(created.id, jake)

    // La ligne du tag survit à l'article (rien ne la supprime) : sans la clause
    // `articles: { some: {} }`, la sidebar proposerait un filtre qui ne ramène
    // plus rien.
    expect(await prismaTestClient.tag.count()).toBe(1)
    expect(await tags.listUsed()).toEqual([])
  })

  it('AC-3: rend une liste vide quand rien n’est publié', async () => {
    expect(await tags.listUsed()).toEqual([])
  })
})
