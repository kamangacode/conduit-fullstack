import { Module } from '@nestjs/common'
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
import { ARTICLE_QUERY } from '../../domain/article/ports/article-query.port'
import { ARTICLE_REPOSITORY } from '../../domain/article/ports/article-repository.port'
import { FAVORITE_REPOSITORY } from '../../domain/article/ports/favorite-repository.port'
import {
  COMMENT_QUERY,
  COMMENT_REPOSITORY,
} from '../../domain/comment/ports/comment-repository.port'
import { PrismaArticleQuery } from '../../infrastructure/persistence/prisma-article.query'
import { PrismaArticleRepository } from '../../infrastructure/persistence/prisma-article.repository'
import {
  PrismaCommentQuery,
  PrismaCommentRepository,
} from '../../infrastructure/persistence/prisma-comment.repository'
import { PrismaFavoriteRepository } from '../../infrastructure/persistence/prisma-favorite.repository'
import { PrismaIdempotencyStore } from '../../infrastructure/persistence/prisma-idempotency.store'
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor'
import { IDEMPOTENCY_STORE } from '../idempotency/idempotency-store.port'
import { UserModule } from '../user/user.module'
import { ArticleController } from './article.controller'

/**
 * Câblage des contextes `article` et `comment`.
 *
 * Les deux vivent dans le même module parce qu'ils partagent leurs routes : le
 * contrat expose les commentaires **sous** l'article (`/articles/:slug/comments`),
 * et un module séparé n'aurait donné ni une frontière de déploiement, ni une
 * frontière de test — seulement deux fichiers à ouvrir pour lire un contrôleur.
 * Les *domaines*, eux, restent distincts, et c'est là que la séparation compte.
 *
 * Comme `ProfileModule`, ce module **importe** `UserModule` au lieu de
 * redéclarer ses providers : les guards ont besoin de `TOKEN_SERVICE` et de
 * `USER_REPOSITORY`, et `PrismaService` doit rester unique. Le redéclarer
 * produirait un second pool de connexions, invisible en test et coûteux en
 * production.
 *
 * Six ports rencontrent ici leur adapter, et c'est le seul endroit du dépôt où
 * ça arrive pour eux. Aucun use-case ne sait que Prisma existe.
 *
 * Le sixième est d'une autre nature : `IDEMPOTENCY_STORE` ne sert aucun domaine,
 * il porte une préoccupation de transport (ADR 027). Il est donc déclaré dans
 * `interface/` et non dans `domain/`, et c'est la seule exception du dépôt à la
 * provenance des ports.
 */
@Module({
  imports: [UserModule],
  controllers: [ArticleController],
  providers: [
    { provide: ARTICLE_REPOSITORY, useClass: PrismaArticleRepository },
    { provide: ARTICLE_QUERY, useClass: PrismaArticleQuery },
    { provide: FAVORITE_REPOSITORY, useClass: PrismaFavoriteRepository },
    { provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository },
    { provide: COMMENT_QUERY, useClass: PrismaCommentQuery },
    // Sixième port, de nature différente des cinq autres : il ne sert aucun
    // domaine, il porte l'idempotence du transport (ADR 027). Il est déclaré ici
    // parce que les deux seules routes protégées sont sur ce contrôleur.
    { provide: IDEMPOTENCY_STORE, useClass: PrismaIdempotencyStore },
    IdempotencyInterceptor,
    ListArticlesUseCase,
    GetFeedUseCase,
    GetArticleUseCase,
    CreateArticleUseCase,
    UpdateArticleUseCase,
    DeleteArticleUseCase,
    FavoriteArticleUseCase,
    UnfavoriteArticleUseCase,
    AddCommentUseCase,
    ListCommentsUseCase,
    DeleteCommentUseCase,
  ],
})
export class ArticleModule {}
