import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppModule } from './app.module'
import { CreateArticleUseCase } from './application/article/create-article.use-case'
import { DeleteArticleUseCase } from './application/article/delete-article.use-case'
import { FavoriteArticleUseCase } from './application/article/favorite-article.use-case'
import { GetArticleUseCase } from './application/article/get-article.use-case'
import { GetFeedUseCase } from './application/article/get-feed.use-case'
import { ListArticlesUseCase } from './application/article/list-articles.use-case'
import { UnfavoriteArticleUseCase } from './application/article/unfavorite-article.use-case'
import { UpdateArticleUseCase } from './application/article/update-article.use-case'
import { AddCommentUseCase } from './application/comment/add-comment.use-case'
import { DeleteCommentUseCase } from './application/comment/delete-comment.use-case'
import { ListCommentsUseCase } from './application/comment/list-comments.use-case'
import { FollowUserUseCase } from './application/profile/follow-user.use-case'
import { GetProfileUseCase } from './application/profile/get-profile.use-case'
import { UnfollowUserUseCase } from './application/profile/unfollow-user.use-case'
import { GetCurrentUserUseCase } from './application/user/get-current-user.use-case'
import { LoginUserUseCase } from './application/user/login-user.use-case'
import { RegisterUserUseCase } from './application/user/register-user.use-case'
import { UpdateUserUseCase } from './application/user/update-user.use-case'
import { ENV } from './config/config.module'
import { ARTICLE_QUERY } from './domain/article/ports/article-query.port'
import { ARTICLE_REPOSITORY } from './domain/article/ports/article-repository.port'
import { FAVORITE_REPOSITORY } from './domain/article/ports/favorite-repository.port'
import { COMMENT_QUERY, COMMENT_REPOSITORY } from './domain/comment/ports/comment-repository.port'
import { FOLLOW_REPOSITORY } from './domain/profile/ports/follow-repository.port'
import { TAG_QUERY } from './domain/tag/ports/tag-query.port'
import { PASSWORD_HASHER } from './domain/user/ports/password-hasher.port'
import { TOKEN_SERVICE } from './domain/user/ports/token-service.port'
import { USER_REPOSITORY } from './domain/user/ports/user-repository.port'
import { PrismaArticleQuery } from './infrastructure/persistence/prisma-article.query'
import { PrismaArticleRepository } from './infrastructure/persistence/prisma-article.repository'
import {
  PrismaCommentQuery,
  PrismaCommentRepository,
} from './infrastructure/persistence/prisma-comment.repository'
import { PrismaFavoriteRepository } from './infrastructure/persistence/prisma-favorite.repository'
import { PrismaFollowRepository } from './infrastructure/persistence/prisma-follow.repository'
import { PrismaIdempotencyStore } from './infrastructure/persistence/prisma-idempotency.store'
import { PrismaTagQuery } from './infrastructure/persistence/prisma-tag.query'
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository'
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher'
import { JoseTokenService } from './infrastructure/security/jose-token.service'
import { AuthGuard, OptionalAuthGuard } from './interface/auth/auth.guard'
import { HealthController } from './interface/health/health.controller'
import { IdempotencyInterceptor } from './interface/idempotency/idempotency.interceptor'
import { IDEMPOTENCY_STORE } from './interface/idempotency/idempotency-store.port'

/**
 * Boot-smoke du graphe d'injection (rule 16, couture DI) et de la configuration.
 *
 * Un trou de câblage NestJS ne se voit ni à la compilation ni dans les tests
 * unitaires : chaque use-case testé avec ses ports mockés passe au vert, et
 * c'est le `main.ts` en production qui découvre qu'un provider manque au
 * module. Ces tests ferment cet angle mort en compilant le graphe **réel**,
 * sans base de données.
 */

// Secrets « bare-env » posés avant la compilation du graphe (rule 12) : la
// configuration est validée à l'instanciation du module, donc un graphe qui
// compile prouve aussi que l'environnement tient. Valeurs synthétiques.
beforeEach(() => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgresql://conduit:conduit@localhost:5432/conduit_test?schema=public'
  )
  vi.stubEnv('JWT_SECRET', 'x'.repeat(64))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AppModule — boot smoke DI', () => {
  it('compile le graphe complet sans base de données', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    expect(moduleRef).toBeDefined()
    await moduleRef.close()
  })

  it('résout ses collaborateurs non-null', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // `.compile()` réussirait même si un provider était mal câblé mais jamais
    // demandé : c'est la résolution effective qui prouve le câblage.
    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController)
    // La configuration validée est injectable depuis le graphe : c'est ce qui
    // permettra aux use-cases de la recevoir plutôt que de lire `process.env`.
    expect(moduleRef.get(ENV)).toMatchObject({ NODE_ENV: expect.any(String), PORT: 3001 })

    await moduleRef.close()
  })

  it('résout les sept use-cases de la slice auth et profils', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // Chaque use-case injecte ses ports par symbole : NestJS ne peut pas le
    // vérifier à la compilation TypeScript, et un token non fourni ne se
    // manifesterait qu'au premier appel HTTP en production.
    expect(moduleRef.get(RegisterUserUseCase)).toBeInstanceOf(RegisterUserUseCase)
    expect(moduleRef.get(LoginUserUseCase)).toBeInstanceOf(LoginUserUseCase)
    expect(moduleRef.get(GetCurrentUserUseCase)).toBeInstanceOf(GetCurrentUserUseCase)
    expect(moduleRef.get(UpdateUserUseCase)).toBeInstanceOf(UpdateUserUseCase)
    expect(moduleRef.get(GetProfileUseCase)).toBeInstanceOf(GetProfileUseCase)
    expect(moduleRef.get(FollowUserUseCase)).toBeInstanceOf(FollowUserUseCase)
    expect(moduleRef.get(UnfollowUserUseCase)).toBeInstanceOf(UnfollowUserUseCase)

    await moduleRef.close()
  })

  it('résout les onze use-cases de la slice articles, commentaires et tags', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // Onze use-cases, cinq ports injectés par symbole : c'est le graphe le plus
    // dense du dépôt, donc celui où un token oublié dans un module a le plus de
    // chances de passer la compilation TypeScript et de casser au premier appel.
    expect(moduleRef.get(ListArticlesUseCase)).toBeInstanceOf(ListArticlesUseCase)
    expect(moduleRef.get(GetFeedUseCase)).toBeInstanceOf(GetFeedUseCase)
    expect(moduleRef.get(GetArticleUseCase)).toBeInstanceOf(GetArticleUseCase)
    expect(moduleRef.get(CreateArticleUseCase)).toBeInstanceOf(CreateArticleUseCase)
    expect(moduleRef.get(UpdateArticleUseCase)).toBeInstanceOf(UpdateArticleUseCase)
    expect(moduleRef.get(DeleteArticleUseCase)).toBeInstanceOf(DeleteArticleUseCase)
    expect(moduleRef.get(FavoriteArticleUseCase)).toBeInstanceOf(FavoriteArticleUseCase)
    expect(moduleRef.get(UnfavoriteArticleUseCase)).toBeInstanceOf(UnfavoriteArticleUseCase)
    expect(moduleRef.get(AddCommentUseCase)).toBeInstanceOf(AddCommentUseCase)
    expect(moduleRef.get(ListCommentsUseCase)).toBeInstanceOf(ListCommentsUseCase)
    expect(moduleRef.get(DeleteCommentUseCase)).toBeInstanceOf(DeleteCommentUseCase)

    await moduleRef.close()
  })

  it('câble l’intercepteur d’idempotence sur son magasin, non-null', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // Couture particulière : l'intercepteur est instancié par NestJS, pas par un
    // contrôleur, donc aucun test HTTP ne le voit être construit. Un magasin non
    // résolu ne se manifesterait qu'au premier appel portant une clé — c'est-à-dire
    // sur un chemin qu'aucune suite de conformité n'emprunte (ADR 027).
    expect(moduleRef.get(IdempotencyInterceptor)).toBeInstanceOf(IdempotencyInterceptor)
    expect(moduleRef.get(IDEMPOTENCY_STORE)).toBeInstanceOf(PrismaIdempotencyStore)

    await moduleRef.close()
  })

  it('câble les six ports de la slice F3 sur leurs adapters, non-null', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    const articleRepository = moduleRef.get(ARTICLE_REPOSITORY)
    const articleQuery = moduleRef.get(ARTICLE_QUERY)

    // Les deux ports de l'article visent des adapters **différents** (ADR 011) :
    // les intervertir dans le module compilerait sans broncher — les deux sont
    // des classes injectables — et produirait un port de lecture incapable
    // d'écrire, découvert au premier POST.
    expect(articleRepository).not.toBeNull()
    expect(articleRepository).toBeInstanceOf(PrismaArticleRepository)
    expect(articleQuery).not.toBeNull()
    expect(articleQuery).toBeInstanceOf(PrismaArticleQuery)
    expect(moduleRef.get(FAVORITE_REPOSITORY)).toBeInstanceOf(PrismaFavoriteRepository)
    expect(moduleRef.get(COMMENT_REPOSITORY)).toBeInstanceOf(PrismaCommentRepository)
    expect(moduleRef.get(COMMENT_QUERY)).toBeInstanceOf(PrismaCommentQuery)
    expect(moduleRef.get(TAG_QUERY)).toBeInstanceOf(PrismaTagQuery)

    await moduleRef.close()
  })

  it('câble les ports sur leurs adapters concrets, non-null', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // `toBeInstanceOf` seul passerait avec une dépendance `null` injectée en
    // silence (rule 12, anti-pattern `@Optional()`), d'où la double assertion.
    const userRepository = moduleRef.get(USER_REPOSITORY)
    const passwordHasher = moduleRef.get(PASSWORD_HASHER)
    const tokenService = moduleRef.get(TOKEN_SERVICE)
    const followRepository = moduleRef.get(FOLLOW_REPOSITORY)

    expect(userRepository).not.toBeNull()
    expect(userRepository).toBeInstanceOf(PrismaUserRepository)
    expect(passwordHasher).toBeInstanceOf(Argon2PasswordHasher)
    expect(tokenService).toBeInstanceOf(JoseTokenService)
    expect(followRepository).toBeInstanceOf(PrismaFollowRepository)

    await moduleRef.close()
  })

  it('partage une seule instance de PrismaService entre les deux contextes', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // `ProfileModule` importe `UserModule` au lieu de redéclarer ses providers.
    // Redéclarer produirait un second `PrismaService`, donc un second pool de
    // connexions — un doublon invisible en test et coûteux en production. Cette
    // assertion est le seul endroit où ce choix se vérifie.
    const fromUserContext = moduleRef.get(USER_REPOSITORY) as PrismaUserRepository
    const fromProfileContext = moduleRef.get(FOLLOW_REPOSITORY) as PrismaFollowRepository

    expect(Reflect.get(fromUserContext, 'prisma')).toBe(Reflect.get(fromProfileContext, 'prisma'))

    await moduleRef.close()
  })

  it('résout les deux guards d’authentification', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    // Les guards sont instanciés par NestJS à partir des tokens exportés par
    // `UserModule` : un oubli d'export ne casse pas la compilation TypeScript,
    // il casse le boot.
    await expect(moduleRef.resolve(AuthGuard)).resolves.toBeInstanceOf(AuthGuard)
    await expect(moduleRef.resolve(OptionalAuthGuard)).resolves.toBeInstanceOf(OptionalAuthGuard)

    await moduleRef.close()
  })

  it('rejette la compilation d’un module amputé d’un provider', async () => {
    // Le contrôle anti-tautologie du boot-smoke (rule 12) : les assertions
    // ci-dessus passeraient tout aussi bien si `.compile()` ne vérifiait rien.
    // Celle-ci prouve que la compilation échoue **réellement** quand une
    // dépendance manque — donc que le vert des précédentes a une valeur.
    @Injectable()
    class MissingProvider {}

    @Injectable()
    class NeedsMissingProvider {
      constructor(readonly missing: MissingProvider) {}
    }

    @Module({ providers: [NeedsMissingProvider] })
    class AmputatedModule {}

    await expect(
      Test.createTestingModule({ imports: [AmputatedModule] }).compile()
    ).rejects.toThrow(/Nest can't resolve dependencies/)
  })
})

describe('AppModule — fail-fast de configuration', () => {
  it('refuse de compiler avec une configuration d’environnement invalide', async () => {
    // Le fail-fast de la rule 19, vérifié sur le graphe réel : sans cette
    // assertion, rien ne distinguerait « la configuration est validée au boot »
    // de « la configuration est lue au boot ».
    vi.stubEnv('JWT_SECRET', 'trop-court')

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      /JWT_SECRET/
    )
  })
})
