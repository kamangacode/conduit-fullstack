import { createHash } from 'node:crypto'
import {
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { fieldErrors } from '@repo/shared'
import { catchError, concatMap, from, type Observable, of, throwError } from 'rxjs'
import { CURRENT_USER_ID_KEY } from '../auth/auth.guard'
import {
  IDEMPOTENCY_STORE,
  type IdempotencyIdentity,
  type IdempotencyStore,
} from './idempotency-store.port'
import { IDEMPOTENT_ROUTE } from './idempotent.decorator'

/**
 * Idempotence des créations, côté transport (REQ-IDEM-001, ADR 027).
 *
 * Sans clé, deux `POST /api/articles` identiques créent **deux** articles : la
 * résolution de slug suffixe sur refus de la contrainte (ADR 010), donc le
 * second obtient `…-2` et répond 201 comme si de rien n'était. Pour un
 * commentaire, l'identifiant est un `autoincrement` sans unicité — pas même un
 * conflit à signaler.
 *
 * L'en-tête est **facultatif** : ni le PRD ni la spec RealWorld ne le
 * mentionnent, et les deux suites vendorées n'en envoient jamais. Absent, ce
 * fichier ne fait rien du tout, et c'est ce qui garde le contrat externe
 * conforme à la spec.
 */

/**
 * Messages du refus, gardés ici et **non** dans `CONTRACT_MESSAGES` de
 * `packages/shared`.
 *
 * Cette table-là vaut par une propriété que l'ADR 017 lui donne : chaque entrée
 * cite la suite de conformité qui l'exige, ce qui distingue « le contrat dit
 * ceci » de « nous avons choisi ceci ». Les messages ci-dessous relèvent du
 * second cas — aucun client de l'écosystème RealWorld ne les attend — et les y
 * ranger diluerait la seule chose qui rend cette table fiable.
 */
export const IDEMPOTENCY_MESSAGES = {
  invalidKey: `must be a non-empty string of at most ${255} characters`,
  payloadMismatch: 'was already used with a different request body',
  inFlight: 'is already being processed',
} as const

const HEADER = 'idempotency-key'
const FIELD = 'idempotency-key'
const MAX_KEY_LENGTH = 255

/** Ce que l'intercepteur lit de la requête, et rien de plus. */
type InspectedRequest = {
  method: string
  headers: Record<string, string | string[] | undefined>
  body: unknown
  route?: { path?: string }
}

/**
 * Sérialisation **canonique** du corps : clés triées, récursivement.
 *
 * `JSON.stringify` conserve l'ordre d'insertion, donc deux corps sémantiquement
 * identiques mais sérialisés dans un autre ordre produiraient deux empreintes
 * différentes — et le rejeu d'un client qui reconstruit son objet serait refusé
 * en 422 pour une raison invisible à qui le lit.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([name, item]) => `${JSON.stringify(name)}:${canonical(item)}`)
    .join(',')}}`
}

const fingerprintOf = (body: unknown): string =>
  createHash('sha256').update(canonical(body)).digest('hex')

/**
 * Clé demandée, ou `null` si l'appelant n'en fournit pas.
 *
 * Une clé vide ou démesurée est refusée plutôt qu'ignorée : l'ignorer ferait
 * silencieusement retomber la requête dans le comportement non protégé, et
 * l'appelant croirait bénéficier d'une garantie qu'il n'a pas.
 */
function readKey(request: InspectedRequest): string | null {
  const raw = request.headers[HEADER]
  if (raw === undefined) return null

  const key = (Array.isArray(raw) ? (raw[0] ?? '') : raw).trim()
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new UnprocessableEntityException(fieldErrors(FIELD, IDEMPOTENCY_MESSAGES.invalidKey))
  }

  return key
}

function identityOf(request: InspectedRequest, key: string): IdempotencyIdentity {
  const pattern = request.route?.path
  const userId = Reflect.get(request, CURRENT_USER_ID_KEY)

  // Erreurs de câblage, pas d'entrée : une route marquée `@Idempotent()` sans
  // `AuthGuard` n'aurait pas d'identité, et la clé cesserait d'être cloisonnée
  // par compte — la propriété de sécurité d'AC-5. Mieux vaut un échec bruyant au
  // premier appel qu'un cloisonnement silencieusement absent.
  if (typeof userId !== 'string') {
    throw new Error('@Idempotent() sur une route sans AuthGuard : aucune identité vérifiée.')
  }
  if (pattern === undefined) {
    throw new Error('@Idempotent() sur une route dont le motif est illisible.')
  }

  return {
    userId,
    endpoint: `${request.method} ${pattern}`,
    key,
    fingerprint: fingerprintOf(request.body),
  }
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (!this.reflector.get<boolean>(IDEMPOTENT_ROUTE, context.getHandler())) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest<InspectedRequest>()
    const key = readKey(request)
    if (key === null) return next.handle()

    const identity = identityOf(request, key)
    const outcome = await this.store.reserve(identity)

    switch (outcome.kind) {
      case 'payload-mismatch':
        throw new UnprocessableEntityException(
          fieldErrors(FIELD, IDEMPOTENCY_MESSAGES.payloadMismatch)
        )

      case 'in-flight':
        throw new ConflictException(fieldErrors(FIELD, IDEMPOTENCY_MESSAGES.inFlight))

      case 'replay':
        // Le statut d'origine est resservi. Il coïncide avec celui que NestJS
        // appliquerait de toute façon, puisque c'est le même handler qui l'a
        // déclaré — le stocker garde la propriété vraie le jour où une route
        // protégée répondra autre chose que 201.
        context
          .switchToHttp()
          .getResponse<{ status(code: number): unknown }>()
          .status(outcome.status)
        return of(outcome.body)

      case 'reserved':
        return this.executeAndRecord(identity, context, next)
    }
  }

  /**
   * Exécute la requête, puis attache sa réponse à la clé — ou libère la clé si
   * elle échoue.
   *
   * `concatMap` et non `tap` : l'écriture doit être terminée **avant** que la
   * réponse ne parte, sinon un rejeu immédiat pourrait trouver une réservation
   * encore vide et répondre 409 à un client qui a pourtant reçu son 201.
   */
  private executeAndRecord(
    identity: IdempotencyIdentity,
    context: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    const response = context.switchToHttp().getResponse<{ statusCode: number }>()

    return next.handle().pipe(
      concatMap(async (body) => {
        await this.store.complete(identity, response.statusCode, body)
        return body
      }),
      catchError((error: unknown) =>
        from(this.store.release(identity)).pipe(concatMap(() => throwError(() => error)))
      )
    )
  }
}
