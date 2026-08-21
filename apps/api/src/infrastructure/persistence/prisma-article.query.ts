import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type {
  ArticleFilters,
  ArticleQueryPort,
  FeedPagination,
} from '../../application/article/ports/article-query.port'
import type {
  ArticleListPage,
  ArticleSummaryView,
  ArticleView,
} from '../../application/article/ports/article-view'
import type { ViewerId } from '../../application/shared/viewer-id'
import type { Slug } from '../../domain/article/slug'
import { PrismaService } from '../prisma/prisma.service'

/**
 * UUID nul — syntaxiquement valide, mais qu'aucun compte ne peut porter :
 * `@default(uuid())` produit des UUID v4, dont le 13ᵉ caractère vaut toujours
 * `4`.
 *
 * Il sert de valeur de repli pour le lecteur anonyme dans les sous-requêtes de
 * relation. L'alternative — construire l'`include` conditionnellement selon la
 * présence d'un lecteur — produirait deux formes de résultat, donc deux
 * projections à maintenir, pour une différence que la base tranche à coût nul :
 * une jointure sur un identifiant impossible ne ramène simplement rien, ce qui
 * est exactement le `false` attendu pour un anonyme (R-5).
 *
 * On ne peut pas utiliser la chaîne vide à la place : PostgreSQL refuse de la
 * transtyper en `uuid` et l'erreur remonterait en 500.
 */
const NO_VIEWER = '00000000-0000-0000-0000-000000000000'

/**
 * Sous-arbre chargé avec chaque article.
 *
 * Les quatre relations résolvent en une seule requête ce que le contrat exige en
 * plus des colonnes de l'article : l'auteur, ses abonnés filtrés sur le lecteur
 * (`following`), les favoris filtrés sur le lecteur (`favorited`), le compte
 * total de favoris (`favoritesCount`) et les tags.
 *
 * C'est la contrepartie de l'ADR 011 : cette projection ne s'exprime pas en
 * TypeScript testable à doublures, mais elle ne coûte pas une requête par
 * article. Le nombre d'allers-retours ne dépend pas de la taille de la page.
 */
function articleInclude(viewer: ViewerId) {
  const viewerId = viewer ?? NO_VIEWER

  return {
    author: {
      include: {
        // `followers` = les liens dont cet auteur est la cible. Filtrés sur le
        // lecteur, ils répondent « le lecteur suit-il cet auteur ? ».
        followers: { where: { followerId: viewerId }, select: { followerId: true } },
      },
    },
    tags: { select: { name: true } },
    favorites: { where: { userId: viewerId }, select: { userId: true } },
    _count: { select: { favorites: true } },
  } satisfies Prisma.ArticleInclude
}

type ArticleRow = Prisma.ArticleGetPayload<{ include: ReturnType<typeof articleInclude> }>

/**
 * Adapter Prisma du port de lecture des articles
 * (`docs/adr/011-lecture-des-listes-port-dedie.md`).
 *
 * Il remplit les read models de `application/article/ports/article-view.ts`, et
 * non les projections du contrat : la forme du fil est produite plus haut, par
 * le mapper de `interface/` (ADR 031). Aucune requête brute : tout passe par le
 * query builder, donc paramétré (rule 19).
 */
@Injectable()
export class PrismaArticleQuery implements ArticleQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: Slug, viewer: ViewerId): Promise<ArticleView | null> {
    const row = await this.prisma.article.findUnique({
      where: { slug: slug.value },
      include: articleInclude(viewer),
    })
    return row ? toArticle(row) : null
  }

  async list(filters: ArticleFilters, viewer: ViewerId): Promise<ArticleListPage> {
    const where = buildFilters(filters)
    return this.page(where, { limit: filters.limit, offset: filters.offset }, viewer)
  }

  async feed(pagination: FeedPagination, viewer: string): Promise<ArticleListPage> {
    // Le flux est **calculé** à la lecture, jamais matérialisé à l'abonnement :
    // un désabonnement retire donc immédiatement les articles concernés, sans
    // qu'aucune donnée n'ait été recopiée (REQ-ARTICLE-008 AC-6).
    const where: Prisma.ArticleWhereInput = {
      author: { followers: { some: { followerId: viewer } } },
    }
    return this.page(where, pagination, viewer)
  }

  /**
   * Une page et son total.
   *
   * Deux instructions — la tranche et le compte — parce qu'un total **avant**
   * pagination ne se déduit pas d'une tranche. Elles partent dans une seule
   * transaction, donc un seul aller-retour et une lecture cohérente : sans ça,
   * une insertion concurrente entre les deux ferait renvoyer un `articlesCount`
   * qui ne correspond à aucun état réel de la base.
   *
   * Ce qui compte pour la performance n'est pas ce 2 : c'est qu'il reste 2 quelle
   * que soit la taille de la page.
   */
  private async page(
    where: Prisma.ArticleWhereInput,
    pagination: FeedPagination,
    viewer: ViewerId
  ): Promise<ArticleListPage> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        // R-2 : les plus récents d'abord.
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
        include: articleInclude(viewer),
      }),
      this.prisma.article.count({ where }),
    ])

    return { items: rows.map(toSummary), total }
  }
}

/**
 * Traduit les filtres du contrat en clause `where`.
 *
 * `author` et `favoritedBy` désignent tous deux un **username**, et c'est
 * précisément pour ça qu'ils sont distingués ici de façon visible : le premier
 * désigne qui a écrit, le second qui a aimé (REQ-ARTICLE-007 AC-5). Les filtres
 * se cumulent en conjonction — chaque clé ajoutée restreint (AC-6).
 *
 * Un filtre absent n'ajoute pas de clause ; un filtre qui ne correspond à
 * personne produit une page vide, jamais le catalogue entier (AC-8).
 */
function buildFilters(filters: ArticleFilters): Prisma.ArticleWhereInput {
  return {
    ...(filters.tag ? { tags: { some: { name: filters.tag } } } : {}),
    ...(filters.author ? { author: { username: filters.author } } : {}),
    ...(filters.favoritedBy
      ? { favorites: { some: { user: { username: filters.favoritedBy } } } }
      : {}),
  }
}

/**
 * Projection complète (PRD §8 « Single Article »), `body` inclus.
 *
 * Écrite champ par champ, comme toutes les projections de sortie du dépôt : un
 * étalement de la ligne Prisma emporterait `id` et `authorId` — des
 * identifiants internes qui ne sortent jamais de l'API. Le read model ne les
 * déclare pas, donc un étalement ne compilerait même plus.
 */
function toArticle(row: ArticleRow): ArticleView {
  return { ...toSummary(row), body: row.body }
}

/**
 * Projection de liste (PRD §8 « Multiple Articles ») : la même, **sans le
 * `body`** (R-7).
 *
 * Les deux formes dérivent l'une de l'autre plutôt que d'être écrites deux fois,
 * pour que l'écart entre elles reste exactement la règle R-7 — comme
 * `ArticleSummaryView` le fait par `Omit`.
 */
function toSummary(row: ArticleRow): ArticleSummaryView {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    // Trié par nom : la table de jointure ne conserve pas l'ordre de saisie, et
    // un ordre non déterministe rendrait la suite de conformité instable.
    tagList: row.tags.map((tag) => tag.name).sort(),
    // `Date` et non chaîne ISO : la sérialisation est le travail du mapper, pas
    // celui de la persistance (ADR 031).
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Relations filtrées sur le lecteur : non vides = vrai (R-5).
    favorited: row.favorites.length > 0,
    favoritesCount: row._count.favorites,
    author: {
      username: row.author.username,
      bio: row.author.bio,
      image: row.author.image,
      following: row.author.followers.length > 0,
    },
  }
}
