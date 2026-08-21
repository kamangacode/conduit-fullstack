import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import {
  type ArticleResponse,
  type ArticlesResponse,
  type CommentResponse,
  type CommentsResponse,
  type CreateArticleDto,
  type CreateCommentDto,
  createArticleDtoSchema,
  createCommentDtoSchema,
  fieldErrors,
  type ListArticlesQuery,
  listArticlesQuerySchema,
  type UpdateArticleDto,
  updateArticleDtoSchema,
} from '@repo/shared'
import { CreateArticleUseCase } from '../../application/article/create-article.use-case'
import { DeleteArticleUseCase } from '../../application/article/delete-article.use-case'
import { FavoriteArticleUseCase } from '../../application/article/favorite-article.use-case'
import { GetArticleUseCase } from '../../application/article/get-article.use-case'
import { GetFeedUseCase } from '../../application/article/get-feed.use-case'
import { ListArticlesUseCase } from '../../application/article/list-articles.use-case'
import { UnfavoriteArticleUseCase } from '../../application/article/unfavorite-article.use-case'
import { UpdateArticleUseCase } from '../../application/article/update-article.use-case'
import { AddCommentUseCase } from '../../application/comment/add-comment.use-case'
import { DeleteCommentUseCase } from '../../application/comment/delete-comment.use-case'
import { ListCommentsUseCase } from '../../application/comment/list-comments.use-case'
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard'
import { CurrentUserId, OptionalCurrentUserId } from '../auth/current-user.decorator'
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor'
import { Idempotent } from '../idempotency/idempotent.decorator'
import { zodEnvelope, zodQuery } from '../pipes/zod-validation.pipe'
import { toArticle, toArticlesResponse } from './article.mapper'
import { toComment, toCommentsResponse } from './comment.mapper'

/**
 * Identifiant de commentaire, refusé en **422** plutôt qu'en 400.
 *
 * `ParseIntPipe` lève une `BadRequestException` par défaut, et 400 ne figure pas
 * dans les codes du contrat (PRD §10). Le corps produit suit le format §10, comme
 * toute autre erreur de validation.
 */
const parseCommentId = new ParseIntPipe({
  exceptionFactory: () => new UnprocessableEntityException(fieldErrors('id', 'must be an integer')),
})

/**
 * Endpoints des articles, de leurs commentaires et de leurs favoris
 * (PRD §7.3, §7.4, §7.5).
 *
 * **L'ordre de déclaration des routes est significatif** : `GET /feed` précède
 * `GET /:slug`, sinon le second capterait « feed » comme un slug et le flux
 * répondrait 404. C'est le genre de défaut qu'aucun test unitaire ne voit et
 * qu'un test HTTP attrape immédiatement.
 *
 * Trois régimes d'authentification cohabitent, posés **par méthode** :
 * obligatoire (publier, modifier, supprimer, commenter, favoriser), optionnelle
 * (consulter, lister, lire les commentaires), et obligatoire sur le flux qui
 * n'a pas de sens anonyme (R-4). Un guard de classe assorti d'exceptions est la
 * configuration où l'on finit par ouvrir ce qui devait être protégé.
 *
 * Le contrôleur ne contient aucune logique métier : il valide, mappe vers
 * l'input du use-case — en particulier l'identité, qui vient toujours du jeton
 * vérifié et jamais du corps (rule 19) — et enveloppe la réponse.
 */
// L'intercepteur est monté au niveau du contrôleur, mais il ne fait rien tant
// qu'une route ne porte pas `@Idempotent()` : la protection reste déclarée route
// par route, et se lit à l'endroit où elle s'applique (ADR 027).
@UseInterceptors(IdempotencyInterceptor)
@Controller('articles')
export class ArticleController {
  constructor(
    @Inject(ListArticlesUseCase) private readonly listArticles: ListArticlesUseCase,
    @Inject(GetFeedUseCase) private readonly getFeed: GetFeedUseCase,
    @Inject(GetArticleUseCase) private readonly getArticle: GetArticleUseCase,
    @Inject(CreateArticleUseCase) private readonly createArticle: CreateArticleUseCase,
    @Inject(UpdateArticleUseCase) private readonly updateArticle: UpdateArticleUseCase,
    @Inject(DeleteArticleUseCase) private readonly deleteArticle: DeleteArticleUseCase,
    @Inject(FavoriteArticleUseCase) private readonly favoriteArticle: FavoriteArticleUseCase,
    @Inject(UnfavoriteArticleUseCase) private readonly unfavoriteArticle: UnfavoriteArticleUseCase,
    @Inject(AddCommentUseCase) private readonly addComment: AddCommentUseCase,
    @Inject(ListCommentsUseCase) private readonly listComments: ListCommentsUseCase,
    @Inject(DeleteCommentUseCase) private readonly deleteComment: DeleteCommentUseCase
  ) {}

  /** Listing global filtré (REQ-ARTICLE-007). Authentification optionnelle. */
  @Get()
  @UseGuards(OptionalAuthGuard)
  async list(
    @Query(zodQuery(listArticlesQuerySchema)) query: ListArticlesQuery,
    @OptionalCurrentUserId() viewer: string | null
  ): Promise<ArticlesResponse> {
    const page = await this.listArticles.execute({
      filters: {
        ...(query.tag === undefined ? {} : { tag: query.tag }),
        ...(query.author === undefined ? {} : { author: query.author }),
        // Le contrat nomme ce filtre `favorited` ; le port le nomme
        // `favoritedBy`, parce qu'il désigne un utilisateur et non un booléen.
        // La traduction se fait ici, une fois, à la frontière.
        ...(query.favorited === undefined ? {} : { favoritedBy: query.favorited }),
        limit: query.limit,
        offset: query.offset,
      },
      viewer,
    })
    return toArticlesResponse(page)
  }

  /**
   * Flux personnel (REQ-ARTICLE-008). **Déclaré avant `:slug`** — voir la note
   * de classe. Authentification obligatoire (R-4).
   */
  @Get('feed')
  @UseGuards(AuthGuard)
  async feed(
    @Query(zodQuery(listArticlesQuerySchema)) query: ListArticlesQuery,
    @CurrentUserId() viewer: string
  ): Promise<ArticlesResponse> {
    const page = await this.getFeed.execute({
      pagination: { limit: query.limit, offset: query.offset },
      viewer,
    })
    return toArticlesResponse(page)
  }

  /** Consultation unitaire (REQ-ARTICLE-004). Authentification optionnelle (R-5). */
  @Get(':slug')
  @UseGuards(OptionalAuthGuard)
  async show(
    @Param('slug') slug: string,
    @OptionalCurrentUserId() viewer: string | null
  ): Promise<ArticleResponse> {
    const article = await this.getArticle.execute({ slug, viewer })
    return { article: toArticle(article) }
  }

  /** Publication (REQ-ARTICLE-003). 201, conformément à `openapi.yml`. */
  @Post()
  @Idempotent()
  @UseGuards(AuthGuard)
  async create(
    @Body(zodEnvelope('article', createArticleDtoSchema)) dto: CreateArticleDto,
    @CurrentUserId() authorId: string
  ): Promise<ArticleResponse> {
    const article = await this.createArticle.execute({ ...dto, authorId })
    return { article: toArticle(article) }
  }

  /** Modification (REQ-ARTICLE-005). Réservée à l'auteur (R-6). */
  @Put(':slug')
  @UseGuards(AuthGuard)
  async update(
    @Param('slug') slug: string,
    @Body(zodEnvelope('article', updateArticleDtoSchema)) dto: UpdateArticleDto,
    @CurrentUserId() userId: string
  ): Promise<ArticleResponse> {
    // Les clés absentes sont **retirées** plutôt que passées à `undefined` :
    // sous `exactOptionalPropertyTypes`, « clé absente » et « clé présente
    // valant undefined » sont deux types distincts, et c'est le premier que le
    // domaine attend pour distinguer « ne pas toucher » de « remplacer ».
    const changes = {
      ...(dto.title === undefined ? {} : { title: dto.title }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
      ...(dto.body === undefined ? {} : { body: dto.body }),
      ...(dto.tagList === undefined ? {} : { tagList: dto.tagList }),
    }

    const article = await this.updateArticle.execute({ slug, userId, changes })
    return { article: toArticle(article) }
  }

  /** Suppression (REQ-ARTICLE-006). **204 sans corps**, contrairement au favori. */
  @Delete(':slug')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async remove(@Param('slug') slug: string, @CurrentUserId() userId: string): Promise<void> {
    await this.deleteArticle.execute({ slug, userId })
  }

  /** Favoriser (REQ-ARTICLE-009). 200 avec l'article complet. */
  @Post(':slug/favorite')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async favorite(
    @Param('slug') slug: string,
    @CurrentUserId() userId: string
  ): Promise<ArticleResponse> {
    const article = await this.favoriteArticle.execute({ slug, userId })
    return { article: toArticle(article) }
  }

  /** Défavoriser (REQ-ARTICLE-009). 200 également : le contrat renvoie l'article. */
  @Delete(':slug/favorite')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async unfavorite(
    @Param('slug') slug: string,
    @CurrentUserId() userId: string
  ): Promise<ArticleResponse> {
    const article = await this.unfavoriteArticle.execute({ slug, userId })
    return { article: toArticle(article) }
  }

  /** Commenter (REQ-COMMENT-002). 201. */
  @Post(':slug/comments')
  @Idempotent()
  @UseGuards(AuthGuard)
  async addArticleComment(
    @Param('slug') slug: string,
    @Body(zodEnvelope('comment', createCommentDtoSchema)) dto: CreateCommentDto,
    @CurrentUserId() authorId: string
  ): Promise<CommentResponse> {
    const comment = await this.addComment.execute({ slug, body: dto.body, authorId })
    return { comment: toComment(comment) }
  }

  /** Lire la conversation (REQ-COMMENT-003). Authentification optionnelle. */
  @Get(':slug/comments')
  @UseGuards(OptionalAuthGuard)
  async listArticleComments(
    @Param('slug') slug: string,
    @OptionalCurrentUserId() viewer: string | null
  ): Promise<CommentsResponse> {
    const comments = await this.listComments.execute({ slug, viewer })
    return toCommentsResponse(comments)
  }

  /**
   * Supprimer son commentaire (REQ-COMMENT-004). **204 sans corps**.
   *
   * Les deux identifiants du chemin sont transmis au use-case : le slug n'est
   * pas décoratif, c'est lui qui rend vérifiable la cohérence du couple
   * article/commentaire (AC-4).
   */
  @Delete(':slug/comments/:id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async removeArticleComment(
    @Param('slug') slug: string,
    @Param('id', parseCommentId) commentId: number,
    @CurrentUserId() userId: string
  ): Promise<void> {
    await this.deleteComment.execute({ slug, commentId, userId })
  }
}
