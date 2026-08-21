import { Injectable } from '@nestjs/common'
import type { TagName, TagQueryPort } from '../../application/tag/ports/tag-query.port'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Adapter Prisma du port `TagQueryPort`.
 *
 * Toute la règle de REQ-TAG-002 tient dans la clause `where` : `articles: {
 * some: {} }` ne retient que les tags portés par **au moins un** article.
 *
 * Sans elle, `findMany` renverrait aussi les tags devenus orphelins — rien ne
 * les supprime quand le dernier article qui les portait disparaît (ADR 002) —
 * et la sidebar « Popular Tags » proposerait des filtres qui ne ramènent aucun
 * article (AC-4). C'est la différence entre `listUsed` et un `listAll` que le
 * port se garde bien de déclarer.
 *
 * Le tri par nom n'est pas exigé par le contrat ; il est retenu pour la seule
 * raison qu'un ordre non déterministe rendrait la suite de conformité instable.
 * Ce n'est donc pas le tri « par popularité » que suggère le nom du composant
 * front : l'inventer serait ajouter une règle que les autres implémentations
 * Conduit n'ont pas.
 */
@Injectable()
export class PrismaTagQuery implements TagQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listUsed(): Promise<readonly TagName[]> {
    const rows = await this.prisma.tag.findMany({
      where: { articles: { some: {} } },
      select: { name: true },
      orderBy: { name: 'asc' },
    })
    return rows.map((row) => row.name)
  }
}
