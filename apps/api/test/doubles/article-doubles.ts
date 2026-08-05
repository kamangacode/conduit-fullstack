import type { Article, ArticleSummary } from '@repo/shared'
import { ArticleEntity, type ArticleProps } from '@/domain/article/article'
import { ArticleNotFoundError } from '@/domain/article/article.errors'
import type {
  ArticleFilters,
  ArticlePage,
  ArticleQueryPort,
  FeedPagination,
  ViewerId,
} from '@/domain/article/ports/article-query.port'
import type { ArticleRepository, NewArticle } from '@/domain/article/ports/article-repository.port'
import type { FavoriteRepository } from '@/domain/article/ports/favorite-repository.port'
import { Slug } from '@/domain/article/slug'

/**
 * Doublures des ports du contexte `article`, pour la lane **unit** (rule 16).
 *
 * Même parti pris que `auth-doubles.ts` : ce sont des **implémentations réelles
 * en mémoire**, qui appliquent les invariants de la vraie persistance — unicité
 * du slug, idempotence du favori, filtrage par propriétaire. Un use-case qui
 * oublierait un de ces cas échoue dès la lane unit.
 *
 * Une exception assumée : `RecordingArticleQuery`. Le port de lecture ne porte
 * aucun invariant reproductible — sa logique est une projection SQL (jointures,
 * agrégats, calcul de `following` / `favorited`) que réécrire en mémoire
 * reviendrait à tester la doublure plutôt que le code. L'ADR 011 le dit dans ses
 * conséquences négatives : cette logique se couvre en **intégration sur base
 * réelle**. Ce que la lane unit doit prouver, c'est ce que le use-case
 * transmet — le lecteur, la pagination, le slug — et c'est ce que cette
 * doublure enregistre.
 */

let nextId = 0

const makeId = (): string => {
  nextId += 1
  return `a1710000-0000-4000-8000-${String(nextId).padStart(12, '0')}`
}

export const AUTHOR_ID = 'c0ffee00-0000-4000-8000-000000000001'
export const OTHER_USER_ID = 'c0ffee00-0000-4000-8000-000000000002'

export const anArticleProps = (overrides: Partial<ArticleProps> = {}): ArticleProps => ({
  id: makeId(),
  slug: Slug.fromTitle('How to train your dragon'),
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons', 'training'],
  authorId: AUTHOR_ID,
  createdAt: new Date('2016-02-18T03:22:56.637Z'),
  updatedAt: new Date('2016-02-18T03:48:35.824Z'),
  ...overrides,
})

/**
 * Dépôt d'articles en mémoire.
 *
 * Reproduit la propriété que la contrainte `@unique` donne à PostgreSQL : le
 * slug demandé est pris s'il est libre, suffixé sinon (ADR 010). C'est ce qui
 * rend REQ-ARTICLE-003 AC-3 vérifiable sans base — la résolution est
 * déterministe, donc assertable.
 *
 * `update` et `delete` filtrent **par couple `(id, authorId)`**, comme le fera
 * le `WHERE` de l'adapter (rule 19) : une implémentation qui ignorerait
 * l'auteur passerait ici aussi, mais celle qui le vérifie après coup en mémoire
 * échouerait à reproduire le `ArticleNotFoundError` attendu.
 */
export class InMemoryArticleRepository implements ArticleRepository {
  private readonly articles = new Map<string, ArticleProps>()

  constructor(seed: ArticleProps[] = []) {
    for (const props of seed) {
      this.articles.set(props.id, props)
    }
  }

  async findBySlug(slug: Slug): Promise<ArticleEntity | null> {
    for (const props of this.articles.values()) {
      if (props.slug.equals(slug)) {
        return ArticleEntity.fromProps(props)
      }
    }
    return null
  }

  async create(article: NewArticle): Promise<ArticleEntity> {
    const props: ArticleProps = {
      ...article,
      id: makeId(),
      slug: this.resolveFreeSlug(article.slug),
      createdAt: new Date('2016-02-18T03:22:56.637Z'),
      updatedAt: new Date('2016-02-18T03:22:56.637Z'),
    }
    this.articles.set(props.id, props)
    return ArticleEntity.fromProps(props)
  }

  async update(authorId: string, article: ArticleEntity): Promise<ArticleEntity> {
    const current = this.articles.get(article.id)
    if (!current || current.authorId !== authorId) {
      throw new ArticleNotFoundError()
    }

    const props: ArticleProps = {
      id: article.id,
      // Le slug vient de l'entité — c'est elle qui a décidé s'il devait changer.
      // La doublure ne fait que reproduire la résolution d'unicité de la base.
      slug: article.slug.equals(current.slug) ? current.slug : this.resolveFreeSlug(article.slug),
      title: article.title,
      description: article.description,
      body: article.body,
      tagList: article.tagList,
      authorId: current.authorId,
      createdAt: current.createdAt,
      updatedAt: new Date('2016-02-18T04:00:00.000Z'),
    }
    this.articles.set(article.id, props)
    return ArticleEntity.fromProps(props)
  }

  async delete(id: string, authorId: string): Promise<void> {
    const current = this.articles.get(id)
    if (!current || current.authorId !== authorId) {
      throw new ArticleNotFoundError()
    }
    this.articles.delete(id)
  }

  /** Lecture directe, pour qu'une spec puisse constater l'état persisté. */
  snapshot(id: string): ArticleProps | undefined {
    return this.articles.get(id)
  }

  /**
   * Tout l'état persisté, dans l'ordre d'insertion.
   *
   * Nécessaire parce qu'un use-case de création ne renvoie pas l'identifiant
   * interne — sans cet accès, une spec ne pourrait vérifier ce qui a réellement
   * été écrit qu'à travers la réponse, c'est-à-dire à travers la doublure du
   * port de lecture. Elle testerait alors la doublure.
   */
  all(): ArticleProps[] {
    return [...this.articles.values()]
  }

  get size(): number {
    return this.articles.size
  }

  private resolveFreeSlug(candidate: Slug): Slug {
    if (!this.isSlugTaken(candidate)) {
      return candidate
    }

    // Le suffixe repart toujours du candidat de base, jamais du précédent
    // refusé — sans quoi la troisième tentative produirait « …-2-3 ».
    for (let rank = 2; rank < 100; rank += 1) {
      const suffixed = candidate.withSuffix(rank)
      if (!this.isSlugTaken(suffixed)) {
        return suffixed
      }
    }
    throw new Error('slug resolution exhausted')
  }

  private isSlugTaken(slug: Slug): boolean {
    for (const props of this.articles.values()) {
      if (props.slug.equals(slug)) {
        return true
      }
    }
    return false
  }
}

/**
 * Doublure du port de **lecture**.
 *
 * Elle n'imite pas la projection — voir la note d'en-tête. Elle enregistre ce
 * qu'on lui demande (`calls`) et renvoie ce qu'on lui a posé, ce qui permet
 * d'asserter les deux seules choses dont le use-case est responsable : avoir
 * transmis le bon slug, et avoir transmis le **lecteur** (dont dépendent
 * `favorited` et `following`, règle R-5).
 */
export class RecordingArticleQuery implements ArticleQueryPort {
  readonly calls: Array<{ slug: string; viewer: ViewerId }> = []
  readonly listCalls: Array<{ filters: ArticleFilters; viewer: ViewerId }> = []
  readonly feedCalls: Array<{ pagination: FeedPagination; viewer: string }> = []

  constructor(
    private readonly article: Article | null = null,
    private readonly page: ArticlePage = { items: [], total: 0 }
  ) {}

  async findBySlug(slug: Slug, viewer: ViewerId): Promise<Article | null> {
    this.calls.push({ slug: slug.value, viewer })
    return this.article ? { ...this.article, slug: slug.value } : null
  }

  async list(filters: ArticleFilters, viewer: ViewerId): Promise<ArticlePage> {
    this.listCalls.push({ filters, viewer })
    return this.page
  }

  async feed(pagination: FeedPagination, viewer: string): Promise<ArticlePage> {
    this.feedCalls.push({ pagination, viewer })
    return this.page
  }
}

/** Article de contrat minimal, pour poser une réponse dans `RecordingArticleQuery`. */
export const anArticleResponse = (overrides: Partial<Article> = {}): Article => ({
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: 'It takes a Jacobian',
  tagList: ['dragons', 'training'],
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:48:35.824Z',
  favorited: false,
  favoritesCount: 0,
  author: { username: 'jake', bio: null, image: null, following: false },
  ...overrides,
})

/** Résumé d'article de contrat, pour poser une page dans `RecordingArticleQuery`. */
export const anArticleSummary = (overrides: Partial<ArticleSummary> = {}): ArticleSummary => {
  const { body: _body, ...summary } = anArticleResponse()
  return { ...summary, ...overrides }
}

/**
 * Dépôt de favoris en mémoire.
 *
 * Le `Set` porte la même propriété que la clé composite `(userId, articleId)` du
 * schéma : favoriser deux fois ne crée qu'une relation. `writes` permet à une
 * spec de distinguer « idempotent » de « n'a rien fait », que l'état final seul
 * ne sépare pas.
 */
export class InMemoryFavoriteRepository implements FavoriteRepository {
  private readonly links = new Set<string>()
  writes = 0

  constructor(seed: Array<[string, string]> = []) {
    for (const [userId, articleId] of seed) {
      this.links.add(InMemoryFavoriteRepository.key(userId, articleId))
    }
  }

  async favorite(userId: string, articleId: string): Promise<void> {
    this.writes += 1
    this.links.add(InMemoryFavoriteRepository.key(userId, articleId))
  }

  async unfavorite(userId: string, articleId: string): Promise<void> {
    this.writes += 1
    this.links.delete(InMemoryFavoriteRepository.key(userId, articleId))
  }

  has(userId: string, articleId: string): boolean {
    return this.links.has(InMemoryFavoriteRepository.key(userId, articleId))
  }

  get size(): number {
    return this.links.size
  }

  private static key(userId: string, articleId: string): string {
    return `${userId}@${articleId}`
  }
}
