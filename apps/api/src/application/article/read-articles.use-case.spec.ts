import { describe, expect, it } from 'vitest'
import {
  AUTHOR_ID,
  anArticleResponse,
  anArticleSummary,
  RecordingArticleQuery,
} from '../../../test/doubles/article-doubles'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import { GetArticleUseCase } from './get-article.use-case'
import { GetFeedUseCase } from './get-feed.use-case'
import { ListArticlesUseCase } from './list-articles.use-case'

/**
 * Les trois lectures d'articles partagent leur doublure et leur enjeu : ce que
 * le use-case **transmet** au port. La projection elle-même (tri, filtres,
 * `favorited`, `favoritesCount`) est une requête SQL, couverte en intégration
 * (ADR 011, Consequences).
 */

describe('REQ-ARTICLE-004 — consulter un article par son slug', () => {
  it('AC-1: renvoie l’article complet du port de lecture', async () => {
    const query = new RecordingArticleQuery(anArticleResponse())
    const useCase = new GetArticleUseCase(query)

    const article = await useCase.execute({ slug: 'how-to-train-your-dragon', viewer: null })

    expect(article.body).toBe(anArticleResponse().body)
  })

  it('AC-1: transmet un lecteur anonyme explicitement', async () => {
    const query = new RecordingArticleQuery(anArticleResponse())
    const useCase = new GetArticleUseCase(query)

    await useCase.execute({ slug: 'how-to-train-your-dragon', viewer: null })

    expect(query.calls.at(-1)?.viewer).toBeNull()
  })

  it('AC-2: transmet le lecteur authentifié, dont dépendent favorited et following', async () => {
    const query = new RecordingArticleQuery(anArticleResponse())
    const useCase = new GetArticleUseCase(query)

    await useCase.execute({ slug: 'how-to-train-your-dragon', viewer: AUTHOR_ID })

    expect(query.calls.at(-1)?.viewer).toBe(AUTHOR_ID)
  })

  it('AC-3: traduit l’absence en erreur métier « introuvable »', async () => {
    const query = new RecordingArticleQuery(null)
    const useCase = new GetArticleUseCase(query)

    await expect(useCase.execute({ slug: 'jamais-ecrit', viewer: null })).rejects.toBeInstanceOf(
      ArticleNotFoundError
    )
  })

  it('AC-1: transmet le slug de l’URL sans le re-slugifier', async () => {
    // Un slug né d'une collision porte un suffixe. Le re-slugifier serait neutre
    // ici, mais toute normalisation appliquée deux fois finit par diverger — et
    // l'article deviendrait introuvable par le slug qui le désigne.
    const query = new RecordingArticleQuery(anArticleResponse())
    const useCase = new GetArticleUseCase(query)

    await useCase.execute({ slug: 'how-to-train-your-dragon-2', viewer: null })

    expect(query.calls.at(-1)?.slug).toBe('how-to-train-your-dragon-2')
  })
})

describe('REQ-ARTICLE-007 — lister et filtrer les articles publiés', () => {
  const pagination = { limit: 20, offset: 0 }

  it('AC-3: distingue le total avant pagination de la taille de la page', async () => {
    // Le mode de panne que ce test ferme : renvoyer `articles.length` comme
    // `articlesCount`. Les deux coïncident tant qu'on teste avec moins
    // d'articles qu'une page — donc l'erreur ne se voit qu'en production, où
    // elle casse le calcul du nombre de pages du front.
    const query = new RecordingArticleQuery(null, {
      items: [anArticleSummary(), anArticleSummary()],
      total: 47,
    })
    const useCase = new ListArticlesUseCase(query)

    const response = await useCase.execute({ filters: pagination, viewer: null })

    expect(response.items).toHaveLength(2)
    expect(response.total).toBe(47)
  })

  it('AC-1: renvoie une page vide plutôt que rien sur un résultat vide', async () => {
    const query = new RecordingArticleQuery(null, { items: [], total: 0 })
    const useCase = new ListArticlesUseCase(query)

    const response = await useCase.execute({ filters: pagination, viewer: null })

    // L'enveloppe `{ articles: [], articlesCount: 0 }` est vérifiée là où elle
    // est désormais produite : `interface/article/article.mapper.spec.ts`.
    expect(response).toEqual({ items: [], total: 0 })
  })

  it('AC-4: transmet les filtres au port sans les réinterpréter', async () => {
    const query = new RecordingArticleQuery(null)
    const useCase = new ListArticlesUseCase(query)

    await useCase.execute({
      filters: { ...pagination, tag: 'dragons', author: 'jake', favoritedBy: 'jacob' },
      viewer: null,
    })

    expect(query.listCalls.at(-1)?.filters).toMatchObject({
      tag: 'dragons',
      author: 'jake',
      favoritedBy: 'jacob',
    })
  })

  it('AC-5: garde author et favoritedBy distincts', async () => {
    // Les deux prennent un username et renvoient des articles ; les confondre
    // passerait un test écrit sur un jeu où l'auteur a favorisé ses propres
    // articles.
    const query = new RecordingArticleQuery(null)
    const useCase = new ListArticlesUseCase(query)

    await useCase.execute({ filters: { ...pagination, author: 'jake' }, viewer: null })

    expect(query.listCalls.at(-1)?.filters.author).toBe('jake')
    expect(query.listCalls.at(-1)?.filters.favoritedBy).toBeUndefined()
  })

  it('AC-7: transmet le lecteur pour que favorited et following soient calculés', async () => {
    const query = new RecordingArticleQuery(null)
    const useCase = new ListArticlesUseCase(query)

    await useCase.execute({ filters: pagination, viewer: AUTHOR_ID })

    expect(query.listCalls.at(-1)?.viewer).toBe(AUTHOR_ID)
  })
})

describe('REQ-ARTICLE-008 — consulter le flux personnel', () => {
  const pagination = { limit: 20, offset: 0 }

  it('AC-1: renvoie le flux dans l’enveloppe du contrat', async () => {
    const query = new RecordingArticleQuery(null, { items: [anArticleSummary()], total: 1 })
    const useCase = new GetFeedUseCase(query)

    const response = await useCase.execute({ pagination, viewer: AUTHOR_ID })

    expect(response.total).toBe(1)
    expect(response.items).toHaveLength(1)
  })

  it('AC-1: interroge le port du flux, jamais celui du listing global', async () => {
    // Router le flux vers `list` renverrait tous les articles du site à la place
    // des seuls auteurs suivis — une réponse bien formée et entièrement fausse.
    const query = new RecordingArticleQuery(null)
    const useCase = new GetFeedUseCase(query)

    await useCase.execute({ pagination, viewer: AUTHOR_ID })

    expect(query.feedCalls).toHaveLength(1)
    expect(query.listCalls).toHaveLength(0)
  })

  it('AC-4: transmet la pagination demandée', async () => {
    const query = new RecordingArticleQuery(null)
    const useCase = new GetFeedUseCase(query)

    await useCase.execute({ pagination: { limit: 2, offset: 2 }, viewer: AUTHOR_ID })

    expect(query.feedCalls.at(-1)?.pagination).toEqual({ limit: 2, offset: 2 })
  })

  it('AC-3: identifie le lecteur dont le flux est demandé', async () => {
    const query = new RecordingArticleQuery(null)
    const useCase = new GetFeedUseCase(query)

    await useCase.execute({ pagination, viewer: AUTHOR_ID })

    expect(query.feedCalls.at(-1)?.viewer).toBe(AUTHOR_ID)
  })
})
