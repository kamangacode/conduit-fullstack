import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import type { FavoriteRepository } from '../../domain/article/ports/favorite-repository.port'
import { PrismaService } from '../prisma/prisma.service'

/** Violation d'unicité — ici, la clé composite `(userId, articleId)`. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002'

/** Violation de clé étrangère — l'article ou le compte référencé n'existe plus. */
const FOREIGN_KEY_VIOLATION = 'P2003'

/**
 * Adapter Prisma du port `FavoriteRepository`.
 *
 * Même mécanique que le suivi (`PrismaFollowRepository`), pour la même raison :
 * l'idempotence promise par le port s'obtient **sans branche conditionnelle**,
 * en s'appuyant sur la clé composite du schéma.
 *
 * - `favorite` utilise `upsert` avec un `update` vide : re-favoriser retombe sur
 *   une branche qui ne modifie rien. « Lire puis créer si absent » laisserait
 *   une fenêtre de course pendant laquelle un second appel insère la même ligne,
 *   et la contrainte ferait alors échouer une opération que le contrat veut
 *   idempotente (REQ-ARTICLE-009 AC-2).
 * - `unfavorite` utilise `deleteMany` et non `delete` : ce dernier lève quand la
 *   ligne n'existe pas, ce qui transformerait un retrait sans effet en erreur
 *   (AC-4).
 *
 * Ce port n'expose ni compteur ni état : `favorited` et `favoritesCount` sont
 * **lus** par `PrismaArticleQuery`, qui les calcule depuis cette même table. Un
 * compteur maintenu ici serait une dénormalisation, refusée par l'ADR 002.
 */
@Injectable()
export class PrismaFavoriteRepository implements FavoriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async favorite(userId: string, articleId: string): Promise<void> {
    try {
      await this.prisma.favorite.upsert({
        where: { userId_articleId: { userId, articleId } },
        create: { userId, articleId },
        update: {},
      })
    } catch (error) {
      // Un `upsert` n'est pas atomique : entre son `SELECT` et son `INSERT`, un
      // appel concurrent peut insérer la même ligne. L'état voulu est pourtant
      // atteint, et l'endpoint est idempotent par contrat — traiter ce cas
      // comme un échec transformerait un double clic en erreur.
      if (isPrismaCode(error, UNIQUE_CONSTRAINT_VIOLATION)) {
        return
      }
      throw translateMissingReference(error)
    }
  }

  async unfavorite(userId: string, articleId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, articleId } })
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

/**
 * L'article a disparu entre sa résolution par le use-case et cette écriture.
 *
 * `ArticleNotFoundError` (404) plutôt qu'un 500 : le client apprend que la
 * ressource visée n'est plus là, ce qui est exact et déjà public. Sans cette
 * traduction, l'erreur ne serait pas un `DomainError`, le filtre `@Catch` ne la
 * verrait pas, et le front RealWorld recevrait un 500 au corps illisible.
 */
function translateMissingReference(error: unknown): unknown {
  return isPrismaCode(error, FOREIGN_KEY_VIOLATION) ? new ArticleNotFoundError() : error
}
