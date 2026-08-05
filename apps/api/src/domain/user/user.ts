import type { Profile, User } from '@repo/shared'

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
 * ces règles sont portées par les schémas Zod de `packages/shared`, appliqués à la
 * frontière. Les dupliquer ici créerait deux sources de vérité qui divergeraient
 * au premier changement (rule 21).
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

  /**
   * Projection publique du compte (PRD §8, REQ-PROFILE-002).
   *
   * Écrite champ par champ, jamais par étalement de `props` : un `...this.props`
   * emporterait `email` et `passwordHash` dans une réponse publique. L'énumération
   * explicite fait qu'un champ ajouté à `UserProps` demain ne fuite pas par
   * défaut — il faudra une décision consciente pour l'exposer.
   *
   * `following` est un paramètre et non un attribut : la relation appartient au
   * couple (appelant, cible), pas au compte consulté (règle R-5).
   */
  toProfile(following: boolean): Profile {
    return {
      username: this.props.username,
      bio: this.props.bio,
      image: this.props.image,
      following,
    }
  }

  /**
   * Projection **privée** du compte, renvoyée par les seuls endpoints
   * d'authentification (PRD §8, §9).
   *
   * Contrairement à `toProfile`, elle porte l'email — c'est sa raison d'être. Elle
   * ne porte en revanche **jamais** `passwordHash` (règle R-9), et l'énumération
   * champ par champ est ici encore ce qui le garantit : c'est la projection la
   * plus proche de l'état complet, donc celle où un étalement serait le plus
   * tentant et le plus coûteux.
   *
   * Le jeton est un paramètre parce qu'il n'appartient pas au compte : il est
   * émis par un service d'infrastructure, a une durée de vie propre, et deux
   * réponses successives pour le même compte en portent deux différents.
   */
  toUser(token: string): User {
    return {
      email: this.props.email,
      token,
      username: this.props.username,
      bio: this.props.bio,
      image: this.props.image,
    }
  }
}
