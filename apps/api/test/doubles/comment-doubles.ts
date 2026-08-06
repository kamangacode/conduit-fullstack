import type { Comment, Tag } from '@repo/shared'
import type { ViewerId } from '@/domain/article/ports/article-query.port'
import { CommentEntity, type CommentProps } from '@/domain/comment/comment'
import { CommentNotFoundError } from '@/domain/comment/comment.errors'
import type {
  CommentQueryPort,
  CommentRepository,
  NewComment,
} from '@/domain/comment/ports/comment-repository.port'
import type { TagQueryPort } from '@/domain/tag/ports/tag-query.port'

/**
 * Doublures des ports des contextes `comment` et `tag`, pour la lane **unit**
 * (rule 16). Même parti pris que `article-doubles.ts` : implémentations réelles
 * en mémoire pour l'écriture, enregistrement des appels pour la lecture, dont
 * la projection se couvre en intégration (ADR 011).
 */

let nextCommentId = 0

export const aCommentProps = (overrides: Partial<CommentProps> = {}): CommentProps => {
  nextCommentId += 1
  return {
    id: nextCommentId,
    body: 'His name was my name too.',
    articleId: 'a1710000-0000-4000-8000-000000000001',
    authorId: 'c0ffee00-0000-4000-8000-000000000001',
    createdAt: new Date('2016-02-18T03:22:56.637Z'),
    updatedAt: new Date('2016-02-18T03:22:56.637Z'),
    ...overrides,
  }
}

/**
 * Dépôt de commentaires en mémoire.
 *
 * L'identifiant est un **entier auto-incrémenté**, comme la colonne réelle
 * (ADR 004) : une doublure qui rendrait des UUID laisserait passer un use-case
 * qui traite l'identifiant comme une chaîne, et l'écart n'apparaîtrait qu'en
 * intégration.
 *
 * `delete` filtre par couple `(id, authorId)`, comme le `WHERE` de l'adapter
 * (rule 19).
 */
export class InMemoryCommentRepository implements CommentRepository {
  private readonly comments = new Map<number, CommentProps>()
  private sequence = 1000

  constructor(seed: CommentProps[] = []) {
    for (const props of seed) {
      this.comments.set(props.id, props)
    }
  }

  async findById(id: number): Promise<CommentEntity | null> {
    const props = this.comments.get(id)
    return props ? CommentEntity.fromProps(props) : null
  }

  async create(comment: NewComment): Promise<CommentEntity> {
    this.sequence += 1
    const props: CommentProps = {
      ...comment,
      id: this.sequence,
      createdAt: new Date('2016-02-18T03:22:56.637Z'),
      updatedAt: new Date('2016-02-18T03:22:56.637Z'),
    }
    this.comments.set(props.id, props)
    return CommentEntity.fromProps(props)
  }

  async delete(id: number, authorId: string): Promise<void> {
    const current = this.comments.get(id)
    if (!current || current.authorId !== authorId) {
      throw new CommentNotFoundError()
    }
    this.comments.delete(id)
  }

  snapshot(id: number): CommentProps | undefined {
    return this.comments.get(id)
  }

  all(): CommentProps[] {
    return [...this.comments.values()]
  }

  get size(): number {
    return this.comments.size
  }
}

/** Commentaire de contrat minimal, pour poser une réponse de lecture. */
export const aCommentResponse = (overrides: Partial<Comment> = {}): Comment => ({
  id: 1,
  createdAt: '2016-02-18T03:22:56.637Z',
  updatedAt: '2016-02-18T03:22:56.637Z',
  body: 'His name was my name too.',
  author: { username: 'jake', bio: null, image: null, following: false },
  ...overrides,
})

/**
 * Doublure du port de lecture des commentaires : elle enregistre l'article et le
 * **lecteur** transmis, seuls éléments dont le use-case répond (R-5).
 */
export class RecordingCommentQuery implements CommentQueryPort {
  readonly listCalls: Array<{ articleId: string; viewer: ViewerId }> = []
  readonly findCalls: Array<{ id: number; viewer: ViewerId }> = []

  constructor(
    private readonly comments: readonly Comment[] = [],
    private readonly single: Comment | null = aCommentResponse()
  ) {}

  async listByArticle(articleId: string, viewer: ViewerId): Promise<readonly Comment[]> {
    this.listCalls.push({ articleId, viewer })
    return this.comments
  }

  async findById(id: number, viewer: ViewerId): Promise<Comment | null> {
    this.findCalls.push({ id, viewer })
    return this.single ? { ...this.single, id } : null
  }
}

/**
 * Doublure du port de lecture des tags.
 *
 * Elle ne reproduit pas la règle « seuls les tags portés par un article » : cette
 * règle est une jointure, donc de l'intégration. Ce que la lane unit peut
 * prouver, c'est que le use-case ne transforme pas ce que le port lui rend.
 */
export class StubTagQuery implements TagQueryPort {
  calls = 0

  constructor(private readonly tags: readonly Tag[] = ['reactjs', 'angularjs']) {}

  async listUsed(): Promise<readonly Tag[]> {
    this.calls += 1
    return this.tags
  }
}
