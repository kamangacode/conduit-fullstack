import type { ArticleEntity } from '../article'
import type { Slug } from '../slug'

/**
 * Données nécessaires pour publier un article.
 *
 * `id` et les horodatages sont absents : ils sont produits par la persistance.
 * `slug` est en revanche **présent** — il est dérivé du titre par le domaine
 * (R-1), pas inventé par la base. L'adapter reste libre de le suffixer si la
 * contrainte d'unicité refuse le candidat (ADR 010) ; c'est la seule liberté
 * qu'il ait sur cette valeur.
 */
export interface NewArticle {
  readonly slug: Slug
  readonly title: string
  readonly description: string
  readonly body: string
  readonly tagList: readonly string[]
  readonly authorId: string
}

/**
 * Port d'**écriture** des articles (rule 12 : interface dans `domain/`, adapter
 * Prisma dans `infrastructure/`).
 *
 * Il ne sert qu'aux opérations qui modifient l'état, et il parle `ArticleEntity`
 * — l'agrégat porteur des invariants. Toute **lecture destinée à l'affichage**
 * passe par `ArticleQueryPort`, qui renvoie la projection du contrat : les deux
 * n'ont ni la même forme de retour ni le même objet, et les fusionner
 * obligerait l'entité à porter `favorited`, un champ qui dépend du lecteur et
 * non de l'article (`docs/adr/011-lecture-des-listes-port-dedie.md`).
 *
 * Repère pour choisir : **« je modifie »** prend ce port, **« j'affiche »**
 * prend le port de lecture.
 *
 * `findBySlug` reste ici parce qu'une modification commence toujours par
 * charger l'agrégat qu'elle va faire évoluer.
 */
export interface ArticleRepository {
  findBySlug(slug: Slug): Promise<ArticleEntity | null>

  /**
   * Publie l'article, en résolvant l'unicité du slug par la contrainte de la
   * base plutôt que par une lecture préalable (ADR 010). Le slug réellement
   * retenu est celui de l'entité renvoyée — il peut différer du candidat.
   */
  create(article: NewArticle): Promise<ArticleEntity>

  /**
   * Persiste l'**état déjà calculé par le domaine**, `slug` compris.
   *
   * La signature prend une entité et non un `ArticleChanges`, et c'est la
   * correction d'un défaut réel : avec un jeu de modifications, l'adapter
   * n'écrivait que les colonnes transmises par le client et le **slug régénéré
   * restait à terre**. Un article renommé gardait son ancienne URL, en
   * contradiction avec R-1 et la spec. Le slug n'étant jamais un champ client,
   * il ne pouvait pas voyager dans `ArticleChanges` ; il voyage donc dans
   * l'entité, seule à savoir s'il devait changer.
   *
   * L'`authorId` reste un **paramètre distinct** de l'entité : c'est l'identité
   * de l'appelant, qui alimente le filtrage par propriétaire dans le `WHERE`
   * (rule 19, anti-IDOR). Lire l'auteur depuis l'entité — donc depuis la ligne
   * relue — reviendrait à comparer une valeur avec elle-même, et le filtre ne
   * protégerait plus rien.
   *
   * @throws ArticleNotFoundError si aucun article ne correspond au couple.
   */
  update(authorId: string, article: ArticleEntity): Promise<ArticleEntity>

  /**
   * Supprime l'article et, par cascade, ses commentaires et ses favoris
   * (REQ-ARTICLE-006 AC-2). Même filtrage par propriétaire que `update`.
   *
   * @throws ArticleNotFoundError si aucun article ne correspond au couple.
   */
  delete(id: string, authorId: string): Promise<void>
}

/** Jeton d'injection — voir la note de `user-repository.port.ts`. */
export const ARTICLE_REPOSITORY = Symbol('ArticleRepository')
