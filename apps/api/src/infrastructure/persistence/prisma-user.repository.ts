import { Injectable } from '@nestjs/common'
import { Prisma, type User as PrismaUser } from '@prisma/client'
import type { NewUser, UserRepository } from '../../domain/user/ports/user-repository.port'
import { type UserChanges, UserEntity } from '../../domain/user/user'
import { EmailAlreadyTakenError, UsernameAlreadyTakenError } from '../../domain/user/user.errors'
import { PrismaService } from '../prisma/prisma.service'

/** Code Prisma d'une violation de contrainte d'unicité. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002'

/**
 * Adapter Prisma du port `UserRepository`.
 *
 * C'est le seul endroit du dépôt qui connaît à la fois le modèle Prisma et
 * l'entité de domaine. La conversion est explicite (`toEntity`) plutôt qu'un
 * transtypage : les deux formes se ressemblent aujourd'hui, mais rien ne les
 * oblige à évoluer ensemble — le domaine ne suit pas la base, c'est la base qui
 * s'aligne sur le contrat (ADR 004).
 */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } })
    return row ? toEntity(row) : null
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { email } })
    return row ? toEntity(row) : null
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { username } })
    return row ? toEntity(row) : null
  }

  async create(user: NewUser): Promise<UserEntity> {
    try {
      const row = await this.prisma.user.create({
        data: {
          email: user.email,
          username: user.username,
          passwordHash: user.passwordHash,
        },
      })
      return toEntity(row)
    } catch (error) {
      throw translateUniqueViolation(error)
    }
  }

  async update(id: string, changes: UserChanges): Promise<UserEntity> {
    try {
      // `changes` ne contient que les clés réellement fournies (le use-case les
      // pose par étalement conditionnel) : Prisma ne touche donc qu'à ces
      // colonnes, et un `bio: null` explicite écrit bien NULL.
      const row = await this.prisma.user.update({ where: { id }, data: changes })
      return toEntity(row)
    } catch (error) {
      throw translateUniqueViolation(error)
    }
  }
}

/**
 * Projection du modèle de persistance vers l'entité de domaine.
 *
 * Écrite champ par champ, comme les projections de sortie : un étalement ferait
 * entrer `createdAt`/`updatedAt` dans une entité qui ne les déclare pas, et la
 * divergence ne se verrait qu'au premier test d'égalité.
 */
function toEntity(row: PrismaUser): UserEntity {
  return UserEntity.fromProps({
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.passwordHash,
    bio: row.bio,
    image: row.image,
  })
}

/**
 * Traduit une violation de contrainte d'unicité en erreur de domaine.
 *
 * C'est ici que se tient la promesse de l'ADR 009 : l'unicité est arbitrée par
 * PostgreSQL, pas par un `SELECT` préalable qui laisserait une fenêtre de course
 * entre la lecture et l'écriture. L'adapter est le seul à voir l'échec de
 * contrainte, donc le seul à pouvoir le nommer.
 *
 * Le champ fautif est lu dans `meta.target`, que Prisma renseigne avec les
 * colonnes de l'index violé. Un conflit dont on ne saurait pas nommer le champ
 * est **relancé tel quel** plutôt que rangé arbitrairement sous « email » : une
 * erreur mal étiquetée enverrait le client corriger un champ qui n'a rien fait.
 */
function translateUniqueViolation(error: unknown): unknown {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return error
  }

  const target = error.meta?.target
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')]

  if (fields.includes('email')) {
    return new EmailAlreadyTakenError()
  }
  if (fields.includes('username')) {
    return new UsernameAlreadyTakenError()
  }

  return error
}
