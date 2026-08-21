/**
 * État persisté d'un compte, tel que le domaine le manipule.
 *
 * Ce n'est **pas** une projection du modèle Prisma : c'est le domaine qui fixe sa
 * forme, et l'adapter qui s'y conforme (rule 12, Dependency Inversion). D'où
 * `bio: string | null` — la valeur du contrat (ADR 004) — plutôt que le
 * `String @default("")` qu'a porté un temps la base.
 */
export interface UserProps {
  readonly id: string
  readonly email: string
  readonly username: string
  /** Condensat argon2id. Le mot de passe en clair n'entre jamais dans l'entité. */
  readonly passwordHash: string
  readonly bio: string | null
  readonly image: string | null
}

/**
 * Mise à jour partielle d'un compte (`PUT /api/user`, REQ-USER-004).
 *
 * La distinction entre **absent** et **`null`** est le cœur de ce type, et elle
 * est portée par la signature elle-même : `bio?: string | null` accepte les trois
 * états que le contrat distingue — clé absente (ne pas toucher), `null`
 * (effacer), chaîne (remplacer). Un `Partial<UserProps>` ne dirait pas la même
 * chose sur `email` ou `username`, qui ne peuvent jamais être effacés.
 */
export interface UserChanges {
  readonly email?: string
  readonly username?: string
  readonly passwordHash?: string
  readonly bio?: string | null
  readonly image?: string | null
}

/**
 * Le compte utilisateur, agrégat du contexte `user`.
 *
 * Immuable : toute évolution renvoie une nouvelle instance plutôt que de muter
 * l'existante. Sur un objet partagé entre un use-case et son repository, la
 * mutation en place produit le mode de panne le plus difficile à lire — une
 * valeur qui change sous les pieds d'un appelant qui ne l'a pas demandé.
 *
 * L'entité ne valide **pas** le format de l'email ni la longueur du mot de passe :
 * ces règles sont portées par les schémas Zod du contrat, appliqués à la
 * frontière. Les dupliquer ici créerait deux sources de vérité qui divergeraient
 * au premier changement (rule 21).
 *
 * Elle ne **projette** pas non plus. Elle portait jusqu'au 2026-08-21 deux
 * méthodes `toProfile(following)` et `toUser(token)` qui fabriquaient les corps
 * de réponse du contrat ; la seconde prenait un JWT en paramètre, c'est-à-dire
 * une valeur sans existence métier. Les projections vivent désormais dans
 * `application/user/account-view.ts`, et leur forme HTTP dans les mappers
 * de `interface/` (ADR 031). L'entité expose ses champs, elle ne décide plus de
 * ce qu'un client en voit.
 */
export class UserEntity {
  private constructor(private readonly props: UserProps) {}

  /**
   * Reconstitution depuis la persistance. Tolérante par contrat (rule 12) : on
   * reconstruit un état qui a **déjà** été validé au moment de sa création, et
   * revalider ici ferait échouer le chargement d'une ligne écrite sous des règles
   * antérieures — exactement ce qu'une factory de reconstitution doit éviter.
   */
  static fromProps(props: UserProps): UserEntity {
    return new UserEntity(props)
  }

  get id(): string {
    return this.props.id
  }

  get email(): string {
    return this.props.email
  }

  get username(): string {
    return this.props.username
  }

  get passwordHash(): string {
    return this.props.passwordHash
  }

  get bio(): string | null {
    return this.props.bio
  }

  get image(): string | null {
    return this.props.image
  }

  /**
   * Applique une mise à jour partielle et renvoie une nouvelle instance.
   *
   * L'opérateur `??` serait faux ici : `bio: null` signifie « efface », et
   * `null ?? ancien` restituerait l'ancienne valeur, transformant un effacement
   * demandé en non-opération silencieuse. La distinction se fait donc sur la
   * **présence de la clé** (`in`), seul test qui sépare « absent » de « null ».
   */
  withChanges(changes: UserChanges): UserEntity {
    return new UserEntity({
      id: this.props.id,
      email: 'email' in changes && changes.email !== undefined ? changes.email : this.props.email,
      username:
        'username' in changes && changes.username !== undefined
          ? changes.username
          : this.props.username,
      passwordHash:
        'passwordHash' in changes && changes.passwordHash !== undefined
          ? changes.passwordHash
          : this.props.passwordHash,
      bio: 'bio' in changes && changes.bio !== undefined ? changes.bio : this.props.bio,
      image: 'image' in changes && changes.image !== undefined ? changes.image : this.props.image,
    })
  }
}
