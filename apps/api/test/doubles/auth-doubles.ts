import type { FollowRepository } from '@/domain/profile/ports/follow-repository.port'
import type { PasswordHasher } from '@/domain/user/ports/password-hasher.port'
import type { TokenService } from '@/domain/user/ports/token-service.port'
import type { NewUser, UserRepository } from '@/domain/user/ports/user-repository.port'
import { type UserChanges, UserEntity, type UserProps } from '@/domain/user/user'
import {
  AuthenticatedUserNotFoundError,
  EmailAlreadyTakenError,
  UsernameAlreadyTakenError,
} from '@/domain/user/user.errors'

/**
 * Doublures des ports du domaine, pour la lane **unit** des use-cases (rule 16).
 *
 * Ce sont des **implémentations réelles en mémoire**, pas des mocks structurels.
 * La différence est décisive : un `vi.fn()` qui renvoie ce qu'on lui dit accepte
 * n'importe quel enchaînement d'appels, y compris un enchaînement incohérent. Une
 * implémentation en mémoire, elle, applique les mêmes invariants que la vraie —
 * ici l'unicité de l'email et du username, et l'unicité de la relation de suivi.
 * Un use-case qui oublierait de traiter un conflit échouerait donc dès la lane
 * unit, sans attendre la lane d'intégration.
 *
 * Ces doublures vivent dans `test/` et non dans `src/` : elles ne sont ni du
 * produit ni comptées dans la couverture, et la config vitest ne les collecte pas
 * comme specs (elles ne portent pas le suffixe `.spec.ts`).
 */

let nextId = 0

/** Identifiants stables et lisibles : un UUID aléatoire rendrait les échecs illisibles. */
const makeId = (): string => {
  nextId += 1
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`
}

export const aUserProps = (overrides: Partial<UserProps> = {}): UserProps => ({
  id: makeId(),
  email: 'jake@jake.jake',
  username: 'jake',
  passwordHash: 'hash:jakejake',
  bio: null,
  image: null,
  ...overrides,
})

/**
 * Dépôt de comptes en mémoire.
 *
 * Applique R-8 comme le ferait PostgreSQL : la collision est détectée à
 * l'écriture, et l'erreur levée est celle du domaine — c'est le contrat que
 * `UserRepository` déclare et que l'adapter Prisma devra honorer.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserProps>()

  constructor(seed: UserProps[] = []) {
    for (const props of seed) {
      this.users.set(props.id, props)
    }
  }

  async findById(id: string): Promise<UserEntity | null> {
    const props = this.users.get(id)
    return props ? UserEntity.fromProps(props) : null
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.findBy((props) => props.email === email)
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.findBy((props) => props.username === username)
  }

  async create(user: NewUser): Promise<UserEntity> {
    this.assertAvailable(user.email, user.username, null)

    const props: UserProps = { ...user, id: makeId(), bio: null, image: null }
    this.users.set(props.id, props)
    return UserEntity.fromProps(props)
  }

  async update(id: string, changes: UserChanges): Promise<UserEntity> {
    const current = this.users.get(id)
    if (!current) {
      // La même erreur de domaine que l'adapter Prisma produit sur un P2025.
      // Lever une `Error` nue ferait diverger la doublure de la vraie
      // implémentation précisément sur un chemin d'erreur — et laisserait la
      // lane unit incapable de voir qu'un 500 remonte au client.
      throw new AuthenticatedUserNotFoundError()
    }

    // `id` exclu de la comparaison : reprendre sa propre valeur n'est pas un
    // conflit (REQ-USER-004 AC-6). C'est aussi ce que fait naturellement une
    // contrainte SQL sur un UPDATE de la même ligne.
    this.assertAvailable(changes.email, changes.username, id)

    const updated = UserEntity.fromProps(current).withChanges(changes)
    const props: UserProps = {
      id: updated.id,
      email: updated.email,
      username: updated.username,
      passwordHash: updated.passwordHash,
      bio: updated.bio,
      image: updated.image,
    }
    this.users.set(id, props)
    return UserEntity.fromProps(props)
  }

  /** Lecture directe, pour qu'une spec puisse constater l'état persisté. */
  snapshot(id: string): UserProps | undefined {
    return this.users.get(id)
  }

  get size(): number {
    return this.users.size
  }

  private async findBy(predicate: (props: UserProps) => boolean): Promise<UserEntity | null> {
    for (const props of this.users.values()) {
      if (predicate(props)) {
        return UserEntity.fromProps(props)
      }
    }
    return null
  }

  private assertAvailable(
    email: string | undefined,
    username: string | undefined,
    exceptId: string | null
  ): void {
    for (const props of this.users.values()) {
      if (props.id === exceptId) {
        continue
      }
      if (email !== undefined && props.email === email) {
        throw new EmailAlreadyTakenError()
      }
      if (username !== undefined && props.username === username) {
        throw new UsernameAlreadyTakenError()
      }
    }
  }
}

/**
 * Dépôt de suivi en mémoire.
 *
 * Le `Set` porte la même propriété que la clé composite `(followerId,
 * followingId)` du schéma Prisma : suivre deux fois ne crée qu'une relation. Le
 * compteur `writes` permet à une spec de distinguer « idempotent » de « n'a rien
 * fait », deux comportements que le seul état final ne sépare pas.
 */
export class InMemoryFollowRepository implements FollowRepository {
  private readonly links = new Set<string>()
  writes = 0

  constructor(seed: Array<[string, string]> = []) {
    for (const [follower, following] of seed) {
      this.links.add(InMemoryFollowRepository.key(follower, following))
    }
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    return this.links.has(InMemoryFollowRepository.key(followerId, followingId))
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    this.writes += 1
    this.links.add(InMemoryFollowRepository.key(followerId, followingId))
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    this.writes += 1
    this.links.delete(InMemoryFollowRepository.key(followerId, followingId))
  }

  get size(): number {
    return this.links.size
  }

  private static key(followerId: string, followingId: string): string {
    return `${followerId}->${followingId}`
  }
}

/**
 * Hachage factice, **reconnaissable et réversible** — donc utilisable seulement
 * en test, ce que le préfixe `hash:` rend évident à la lecture d'un échec.
 *
 * `calls` compte les vérifications : c'est ce qui permet de prouver que la
 * connexion vérifie un mot de passe même quand l'email est inconnu
 * (REQ-USER-003 AC-3), propriété qu'aucune assertion sur la réponse ne peut
 * établir puisque la réponse est justement identique dans les deux cas.
 */
export class FakePasswordHasher implements PasswordHasher {
  verifyCalls = 0

  async hash(plainPassword: string): Promise<string> {
    return `hash:${plainPassword}`
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    this.verifyCalls += 1
    return passwordHash === `hash:${plainPassword}`
  }
}

/**
 * Service de jetons factice : le jeton est `token:<userId>`, ce qui rend le sujet
 * lisible dans une assertion sans avoir à décoder quoi que ce soit.
 */
export class FakeTokenService implements TokenService {
  async issue(userId: string): Promise<string> {
    return `token:${userId}`
  }

  async verify(token: string): Promise<string | null> {
    return token.startsWith('token:') ? token.slice('token:'.length) : null
  }
}
