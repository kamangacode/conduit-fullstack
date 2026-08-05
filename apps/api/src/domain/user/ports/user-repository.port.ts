import type { UserChanges, UserEntity, UserProps } from '../user'

/**
 * Données nécessaires pour créer un compte. `id` est absent : il est produit par
 * la persistance, pas par le use-case.
 */
export type NewUser = Omit<UserProps, 'id' | 'bio' | 'image'>

/**
 * Port de persistance des comptes (rule 12 : l'interface vit dans `domain/`,
 * l'adapter Prisma dans `infrastructure/`).
 *
 * Aucune méthode ne prend ni ne rend un type Prisma : le port parle `UserEntity`.
 * C'est ce qui permet de tester les use-cases avec un double en mémoire, et de
 * changer de persistance sans toucher au métier.
 *
 * **Les méthodes d'écriture lèvent les erreurs d'unicité elles-mêmes**
 * (`EmailAlreadyTakenError`, `UsernameAlreadyTakenError`), plutôt que d'exiger du
 * use-case un `findByEmail` préalable. Ce n'est pas un détail d'ergonomie : entre
 * une lecture et une écriture, un appel concurrent peut insérer la même valeur.
 * Seule la contrainte `@unique` de PostgreSQL arbitre sans fenêtre de course, et
 * c'est donc l'adapter — seul à la voir échouer — qui peut traduire le conflit
 * (ADR 009).
 */
export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>
  findByEmail(email: string): Promise<UserEntity | null>
  findByUsername(username: string): Promise<UserEntity | null>

  /** @throws EmailAlreadyTakenError | UsernameAlreadyTakenError */
  create(user: NewUser): Promise<UserEntity>

  /** @throws EmailAlreadyTakenError | UsernameAlreadyTakenError */
  update(id: string, changes: UserChanges): Promise<UserEntity>
}

/**
 * Jeton d'injection du port.
 *
 * Une interface TypeScript n'existe pas à l'exécution : elle ne peut pas servir
 * de token DI. Un `Symbol` fournit un identifiant unique et non collisionnable,
 * sans importer NestJS dans le domaine — la couche reste pure (rule 12).
 */
export const USER_REPOSITORY = Symbol('UserRepository')
