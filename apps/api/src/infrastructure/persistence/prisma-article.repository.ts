import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ArticleEntity } from '../../domain/article/article'
import { ArticleNotFoundError } from '../../domain/article/article.errors'
import type {
  ArticleRepository,
  NewArticle,
} from '../../domain/article/ports/article-repository.port'
import { Slug } from '../../domain/article/slug'
import { PrismaService } from '../prisma/prisma.service'

/** Violation d'unicité — ici, la contrainte sur `articles.slug`. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002'

/** Enregistrement absent lors d'un `update` ou d'un `delete`. */
const RECORD_NOT_FOUND = 'P2025'

/**
 * Nombre maximal de candidats essayés avant d'abandonner la résolution du slug.
 *
 * Borne de sûreté, pas seuil métier : atteindre 50 homonymes signifierait soit
 * un usage inattendu, soit une boucle qui ne progresse pas. Échouer bruyamment
 * vaut mieux que tourner indéfiniment sous contention.
 */
const MAX_SLUG_ATTEMPTS = 50

const articleInclude = { tags: { select: { name: true } } } satisfies Prisma.ArticleInclude

type ArticleRow = Prisma.ArticleGetPayload<{ include: typeof articleInclude }>

/**
 * Adapter Prisma du port d'**écriture** des articles.
 *
 * Deux propriétés se jouent ici, et aucune des deux n'est visible depuis le
 * use-case :
 *
 * 1. **La résolution du slug** (ADR 010) : on tente l'insertion et on ré-essaie
 *    sur violation de contrainte, sans jamais vérifier au préalable si le slug
 *    est libre. Un `SELECT` avant `INSERT` serait un TOCTOU — deux requêtes
 *    concurrentes liraient la même absence et tenteraient la même valeur.
 * 2. **Le filtrage par propriétaire dans la requête** (rule 19, anti-IDOR) :
 *    `update` et `delete` portent `authorId` dans leur `where`, plutôt que de
 *    charger l'article puis comparer en mémoire. Il n'y a donc aucune fenêtre
 *    entre la vérification et l'écriture.
 *
 * Aucune requête brute : tout passe par le query builder, donc paramétré.
 */
@Injectable()
export class PrismaArticleRepository implements ArticleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: Slug): Promise<ArticleEntity | null> {
    const row = await this.prisma.article.findUnique({
      where: { slug: slug.value },
      include: articleInclude,
    })
    return row ? toEntity(row) : null
  }

  async create(article: NewArticle): Promise<ArticleEntity> {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      // Le candidat repart toujours du slug **de base** : suffixer le candidat
      // précédemment refusé produirait « mon-titre-2-3 » à la troisième
      // tentative. `withSuffix` prend donc le rang, pas un état interne.
      const candidate = attempt === 1 ? article.slug : article.slug.withSuffix(attempt)

      try {
        const row = await this.prisma.article.create({
          data: {
            slug: candidate.value,
            title: article.title,
            description: article.description,
            body: article.body,
            authorId: article.authorId,
            tags: {
              // Un tag déjà utilisé est réutilisé, jamais recréé
              // (REQ-ARTICLE-003 AC-5) : c'est ce qui garde la liste des tags
              // alignée sur la réalité des articles.
              connectOrCreate: article.tagList.map((name) => ({
                where: { name },
                create: { name },
              })),
            },
          },
          include: articleInclude,
        })
        return toEntity(row)
      } catch (error) {
        if (isSlugConflict(error)) {
          continue
        }
        throw error
      }
    }

    // Épuisement : erreur d'infrastructure, pas erreur métier — le client n'a
    // rien fait de mal et aucun message du contrat ne décrit ce cas.
    throw new Error(`slug resolution exhausted after ${MAX_SLUG_ATTEMPTS} attempts`)
  }

  async update(authorId: string, article: ArticleEntity): Promise<ArticleEntity> {
    // Le slug fait partie de l'état écrit : c'est l'entité qui l'a régénéré si
    // le titre a changé (R-1). L'omettre laissait l'article renommé sous son
    // ancienne URL — le défaut que la lane d'intégration a révélé.
    //
    // Il peut donc entrer en collision, exactement comme à la création, et se
    // résout par la même mécanique : tenter, puis suffixer sur refus (ADR 010).
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 1 ? article.slug : article.slug.withSuffix(attempt)

      try {
        const row = await this.prisma.article.update({
          // `authorId` dans le `where`, jamais dans un contrôle applicatif après
          // lecture (rule 19). Une ligne qui n'appartient pas à l'appelant ne
          // correspond simplement à rien, et Prisma lève P2025.
          where: { id: article.id, authorId },
          data: {
            slug: candidate.value,
            title: article.title,
            description: article.description,
            body: article.body,
            // `set: []` d'abord : la liste **remplace** la précédente, elle ne
            // s'y ajoute pas.
            tags: {
              set: [],
              connectOrCreate: article.tagList.map((name) => ({
                where: { name },
                create: { name },
              })),
            },
          },
          include: articleInclude,
        })
        return toEntity(row)
      } catch (error) {
        if (isSlugConflict(error)) {
          continue
        }
        throw translateMissingArticle(error)
      }
    }

    throw new Error(`slug resolution exhausted after ${MAX_SLUG_ATTEMPTS} attempts`)
  }

  async delete(id: string, authorId: string): Promise<void> {
    try {
      // Les commentaires et les favoris partent par cascade déclarée au schéma
      // (REQ-ARTICLE-006 AC-2) : une orchestration en trois suppressions depuis
      // le use-case laisserait un état partiel si la deuxième échouait.
      await this.prisma.article.delete({ where: { id, authorId } })
    } catch (error) {
      throw translateMissingArticle(error)
    }
  }
}

/**
 * Le slug n'est pas régénéré à la lecture : il est **reconstitué tel quel**.
 * Re-slugifier une valeur stockée la ferait diverger de la base au premier
 * changement de règle de slugification, et l'article deviendrait introuvable par
 * le slug qui le désigne pourtant.
 */
function toEntity(row: ArticleRow): ArticleEntity {
  return ArticleEntity.fromProps({
    id: row.id,
    slug: Slug.fromPersisted(row.slug),
    title: row.title,
    description: row.description,
    body: row.body,
    tagList: row.tags.map((tag) => tag.name),
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

/**
 * Un conflit d'unicité **sur le slug** est une invitation à ré-essayer ; tout
 * autre conflit est une vraie erreur.
 *
 * La distinction compte : traiter n'importe quel P2002 comme « slug pris »
 * ferait boucler 50 fois sur une contrainte qui n'a rien à voir, puis échouer
 * avec un message trompeur.
 */
function isSlugConflict(error: unknown): boolean {
  if (!isPrismaCode(error, UNIQUE_CONSTRAINT_VIOLATION)) {
    return false
  }
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')]
  return fields.includes('slug')
}

/**
 * P2025 signifie ici « aucune ligne ne correspond au couple `(id, authorId)` ».
 *
 * Deux causes indiscernables à ce niveau : l'article n'existe plus, ou il ne
 * m'appartient pas. Le use-case a déjà vérifié les deux avant d'appeler — c'est
 * lui qui distingue le 404 du 403. Ce chemin ne se déclenche donc que sur une
 * course entre sa vérification et cette écriture, et `ArticleNotFoundError` y
 * est la réponse honnête : au moment de l'écriture, l'article visé n'était plus
 * là.
 */
function translateMissingArticle(error: unknown): unknown {
  return isPrismaCode(error, RECORD_NOT_FOUND) ? new ArticleNotFoundError() : error
}
