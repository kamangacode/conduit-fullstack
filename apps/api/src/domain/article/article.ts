import { ArticleNotOwnedError } from './article.errors'
import { Slug } from './slug'

/**
 * État persisté d'un article, tel que le domaine le manipule.
 *
 * Comme pour `UserProps`, ce n'est pas une projection du modèle Prisma : le
 * domaine fixe la forme, l'adapter s'y conforme (rule 12). D'où `slug: Slug` et
 * non `string`, et `authorId: string` plutôt qu'un `author: UserEntity` — le
 * contexte `article` référence l'auteur par identifiant sans dupliquer l'entité
 * du contexte `user` (Context Mapping, rule 12).
 *
 * `favorited` et `favoritesCount` sont **absents** : ils ne sont pas des
 * attributs de l'article. Le premier dépend du lecteur, le second est un agrégat
 * sur la table des favoris. Les loger ici obligerait à porter une valeur
 * différente par lecteur dans une entité censée être unique — c'est ce que
 * `docs/adr/011-lecture-des-listes-port-dedie.md` évite en confiant la
 * projection au port de lecture.
 */
export interface ArticleProps {
  readonly id: string
  readonly slug: Slug
  readonly title: string
  readonly description: string
  readonly body: string
  readonly tagList: readonly string[]
  readonly authorId: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Mise à jour partielle d'un article (`PUT /api/articles/:slug`,
 * REQ-ARTICLE-005).
 *
 * Aucun champ n'accepte `null` : contrairement à la `bio` d'un compte, aucun
 * champ d'article n'est effaçable — le contrat les déclare requis. La seule
 * distinction utile est donc « transmis / absent », que `?:` porte à lui seul.
 */
export interface ArticleChanges {
  readonly title?: string
  readonly description?: string
  readonly body?: string
  readonly tagList?: readonly string[]
}

/**
 * L'article, agrégat racine du contexte `article`.
 *
 * Immuable comme `UserEntity`, pour la même raison : une entité partagée entre
 * un use-case et son repository qui muterait en place change de valeur sous les
 * pieds d'un appelant qui ne l'a pas demandé.
 *
 * L'entité ne valide ni la longueur du titre ni le format du corps : ces règles
 * vivent dans les schémas Zod de `packages/shared`, appliqués à la frontière.
 * Les dupliquer ici créerait deux sources de vérité (rule 21).
 */
export class ArticleEntity {
  private constructor(private readonly props: ArticleProps) {}

  /**
   * Reconstitution depuis la persistance. Tolérante par contrat (rule 12) :
   * l'état relu a déjà été validé à sa création, et le revalider ferait échouer
   * le chargement d'une ligne écrite sous des règles antérieures.
   */
  static fromProps(props: ArticleProps): ArticleEntity {
    return new ArticleEntity(props)
  }

  get id(): string {
    return this.props.id
  }

  get slug(): Slug {
    return this.props.slug
  }

  get title(): string {
    return this.props.title
  }

  get description(): string {
    return this.props.description
  }

  get body(): string {
    return this.props.body
  }

  get tagList(): readonly string[] {
    return this.props.tagList
  }

  get authorId(): string {
    return this.props.authorId
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  /** Règle R-6, exprimée en question plutôt qu'en garde — voir `assertEditableBy`. */
  isAuthoredBy(userId: string): boolean {
    return this.props.authorId === userId
  }

  /**
   * Garde de la règle R-6 : seul l'auteur modifie ou supprime son article
   * (REQ-ARTICLE-005 AC-4, REQ-ARTICLE-006 AC-3).
   *
   * Cette garde est une **seconde barrière**, pas la barrière. La première est
   * le filtrage par propriétaire dans la requête SQL (rule 19), qui ne laisse
   * aucune fenêtre entre la lecture et l'écriture. Celle-ci rend l'invariant
   * lisible dans le domaine et couvre le chemin où un use-case aurait chargé
   * l'article par son seul slug.
   */
  assertEditableBy(userId: string): void {
    if (!this.isAuthoredBy(userId)) {
      throw new ArticleNotOwnedError()
    }
  }

  /**
   * Applique une mise à jour partielle et renvoie une nouvelle instance.
   *
   * Le slug ne suit le titre que si le titre **change réellement**
   * (REQ-ARTICLE-005 AC-2 et AC-3). Deux pièges se referment ici :
   *
   * - régénérer à chaque appel casserait les URL d'un article dont on ne corrige
   *   que la description — rien ne l'oblige, mais c'est ce que produit le code
   *   le plus court ;
   * - régénérer sur un titre renvoyé **identique** effacerait le suffixe d'un
   *   slug né d'une collision (`…-2` redeviendrait `…`), donc changerait l'URL
   *   d'un article dont rien n'a bougé, et le renverrait vers une collision.
   *
   * Les horodatages ne sont pas touchés : `updatedAt` est produit par la
   * persistance (`@updatedAt`). Le domaine n'appelle pas `new Date()` — une
   * entité qui lit l'horloge n'est plus testable sans la piloter.
   */
  withChanges(changes: ArticleChanges): ArticleEntity {
    const title = changes.title ?? this.props.title
    const titleChanged = title !== this.props.title

    return new ArticleEntity({
      ...this.props,
      title,
      slug: titleChanged ? Slug.fromTitle(title) : this.props.slug,
      description: changes.description ?? this.props.description,
      body: changes.body ?? this.props.body,
      tagList: changes.tagList ?? this.props.tagList,
    })
  }
}
