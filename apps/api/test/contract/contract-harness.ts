import type {
  CallHandler,
  ExecutionContext,
  INestApplication,
  NestInterceptor,
} from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { type Observable, tap } from 'rxjs'
import { contractViolation } from './contract-assertion'
import { staleContracts, undeclaredRoutes } from './contract-registry-check'
import { routeKey } from './route-contracts'

/**
 * Le harnais de contrat monté sur l'application de test (REQ-ARCH-002, ADR 026).
 *
 * **Ce fichier ne part jamais en production.** Il vit sous `test/`, il n'est
 * importé par aucun module NestJS, et l'application réelle ne valide pas ses
 * sorties — le choix est tranché par l'ADR 026 : parser à l'exécution ferait
 * tomber un écran sur une divergence de contrat, ce qui est une décision de
 * produit et non d'outillage.
 *
 * Ce qu'il apporte : les specs d'intégration n'ont plus une assertion de
 * contrat à écrire. Toute réponse de succès qui traverse l'application est
 * confrontée au schéma de sa route, donc chaque test existant devient, en plus
 * de ce qu'il testait déjà, un test de contrat.
 *
 * **Pourquoi accumuler au lieu de lever.** Une exception jetée depuis un
 * intercepteur devient une 500, et le test échoue sur « attendu 200, reçu 500 »
 * — un diagnostic qui ne nomme jamais la vraie cause. Les écarts sont donc
 * collectés, puis vidés par le `afterEach` de `test/integration/setup.ts`, qui
 * les impute au test qui les a provoqués **avec** leur motif complet.
 */

/** Écarts observés depuis le dernier drainage. Vidé après chaque test. */
const violations: string[] = []

/** Forme minimale du routeur Express 5, réduite à ce que le harnais lit. */
type ExpressLayer = { route?: { path?: string; methods?: Record<string, boolean> } }
type ExpressApp = { router?: { stack?: ExpressLayer[] }; _router?: { stack?: ExpressLayer[] } }

/** Ce que l'intercepteur a besoin de lire de la requête, et rien de plus. */
type InspectedRequest = { method: string; originalUrl?: string; route?: { path?: string } }

@Injectable()
export class ContractInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<InspectedRequest>()

    return next.handle().pipe(
      tap((body) => {
        const pattern = request.route?.path

        // Un chemin illisible désactiverait le harnais en silence sur cette
        // réponse : c'est donc un écart, pas un cas à ignorer.
        if (pattern === undefined) {
          violations.push(
            `${request.method} ${request.originalUrl ?? '?'} — réponse de succès dont le motif de route est illisible : le harnais ne peut pas la confronter au contrat.`
          )
          return
        }

        const violation = contractViolation(routeKey(request.method, pattern), body)
        if (violation !== null) {
          violations.push(`${request.method} ${request.originalUrl ?? pattern} — ${violation}`)
        }
      })
    )
  }
}

/** Rend les écarts accumulés et repart d'une liste vide. */
export function drainViolations(): string[] {
  return violations.splice(0, violations.length)
}

/**
 * Clés `MÉTHODE motif` des routes réellement montées, lues sur le routeur
 * Express plutôt que déduites des contrôleurs : ce qui compte est ce que
 * l'application sert, pas ce que le code laisse penser qu'elle sert.
 */
export function mountedRouteKeys(app: INestApplication): string[] {
  const instance = app.getHttpAdapter().getInstance() as ExpressApp
  const layers = (instance.router ?? instance._router)?.stack ?? []

  return layers.flatMap((layer) => {
    const path = layer.route?.path
    if (path === undefined) return []

    return Object.entries(layer.route?.methods ?? {})
      .filter(([method, enabled]) => enabled && method !== '_all')
      .map(([method]) => routeKey(method, path))
  })
}

/**
 * Refuse le démarrage de la lane si le registre et les routes montées ont
 * divergé — dans un sens comme dans l'autre.
 *
 * Appelée après `app.init()`, donc **avant** qu'aucun test ne s'exécute : une
 * route non déclarée doit se voir tout de suite, pas au premier test qui aurait
 * pensé à l'exercer.
 */
export function assertRegistryMatchesRoutes(app: INestApplication): void {
  const mounted = mountedRouteKeys(app)
  const undeclared = undeclaredRoutes(mounted)
  const stale = staleContracts(mounted)

  if (undeclared.length === 0 && stale.length === 0) return

  const details = [
    undeclared.length > 0
      ? `routes montées et non déclarées : ${undeclared.join(', ')}`
      : undefined,
    stale.length > 0 ? `déclarations sans route montée : ${stale.join(', ')}` : undefined,
  ].filter((line) => line !== undefined)

  throw new Error(
    `Registre de contrat désynchronisé (REQ-ARCH-002 AC-4).\n  ${details.join('\n  ')}\n  Corrige apps/api/test/contract/route-contracts.ts.`
  )
}

/**
 * Monte le harnais, démarre l'application, puis vérifie sa couverture.
 *
 * Les trois gestes sont réunis parce qu'ils ne valent qu'ensemble et que leur
 * **ordre** est contraint : un intercepteur global posé après `init()` ne
 * s'applique pas, et la couverture ne peut se lire qu'une fois les routes
 * montées. Les séparer laisserait une spec monter le harnais sans le contrôle
 * de couverture — donc surveiller uniquement les routes qu'elle pense déjà à
 * exercer, ce qui est précisément l'angle mort à fermer.
 */
export async function initWithContractHarness(app: INestApplication): Promise<void> {
  app.useGlobalInterceptors(new ContractInterceptor())
  await app.init()
  assertRegistryMatchesRoutes(app)
}
