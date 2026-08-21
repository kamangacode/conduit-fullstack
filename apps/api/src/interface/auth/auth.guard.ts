import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'
import { AUTH_ERROR_BODY, type AuthFailure } from './auth-error'

/**
 * Préfixe imposé par le contrat RealWorld (PRD §9) : `Token`, **pas** `Bearer`.
 *
 * C'est la raison directe pour laquelle ce guard est écrit à la main plutôt que
 * délégué à Passport, dont l'extracteur par défaut attend `Bearer` (ADR 007).
 */
const AUTH_SCHEME = 'Token'

/** Clé sous laquelle l'identité vérifiée est posée sur la requête. */
export const CURRENT_USER_ID_KEY = 'conduitUserId'

/**
 * Résout l'identité portée par l'en-tête `Authorization`, ou dit pourquoi elle
 * ne l'est pas.
 *
 * Trois refus remontent `invalid` sans se distinguer : jeton mal signé, jeton
 * expiré, sujet qui ne se résout plus en compte. Le dernier est celui qu'on
 * oublie — un jeton parfaitement signé peut désigner un compte supprimé depuis
 * (REQ-AUTH-001 AC-6), et faire confiance au seul `sub` laisserait un fantôme
 * agir avec l'identité d'un compte inexistant.
 */
async function resolveUserId(
  request: Request,
  tokens: TokenService,
  users: UserRepository
): Promise<string | AuthFailure> {
  const header = request.headers.authorization
  if (!header) {
    return 'missing'
  }

  const [scheme, token] = header.split(' ')
  if (scheme !== AUTH_SCHEME || !token) {
    // `Bearer <jwt>` tombe ici, et c'est bien une absence de notre point de vue :
    // le contrat n'emploie que `Token`, donc rien dans cet en-tête n'est un
    // jeton que nous ayons à examiner.
    return 'missing'
  }

  const userId = await tokens.verify(token)
  if (userId === null) {
    return 'invalid'
  }

  // Résolution en base : la signature prouve que NOUS avons émis ce jeton, pas
  // que le compte existe encore.
  //
  // Cette étape n'est pas redondante avec la relecture que fait
  // `GetCurrentUserUseCase` : elle protège les routes qui, elles, ne relisent
  // jamais le compte — `follow`/`unfollow` en tête, où un identifiant fantôme
  // partirait directement en écriture. Un test d'intégration dédié la rend
  // obligatoire (REQ-AUTH-001 AC-6).
  const user = await users.findById(userId)
  return user === null ? 'invalid' : user.id
}

/** Une identité résolue se distingue d'un motif de refus par le fait de n'en être pas un. */
const isFailure = (resolved: string | AuthFailure): resolved is AuthFailure =>
  resolved === 'missing' || resolved === 'invalid'

/**
 * 401 du contrat, dont le corps vient de `auth-error.ts`.
 *
 * Le corps n'est pas construit ici : il est partagé avec le mapper d'erreurs de
 * domaine, qui doit rendre **exactement** le même pour un jeton dont le sujet ne
 * résout plus vers un compte. Voir `auth-error.ts` pour la propriété de sécurité
 * que cette égalité porte.
 */
const unauthorized = (failure: AuthFailure): UnauthorizedException =>
  new UnauthorizedException(AUTH_ERROR_BODY[failure])

/**
 * Guard des routes **protégées** : sans identité valide, la requête est refusée
 * avec un 401 (REQ-AUTH-001 AC-1 à AC-4, AC-6).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const resolved = await resolveUserId(request, this.tokens, this.users)

    if (isFailure(resolved)) {
      throw unauthorized(resolved)
    }

    // L'identité est posée sur la requête, d'où le décorateur la relira. C'est la
    // seule source d'autorité pour la suite du traitement : aucun identifiant
    // d'utilisateur n'est jamais lu dans le corps (rule 19).
    Reflect.set(request, CURRENT_USER_ID_KEY, resolved)
    return true
  }
}

/**
 * Guard des routes à authentification **optionnelle** : jamais de refus.
 *
 * Un jeton absent, invalide ou expiré produit une consultation anonyme, pas un
 * 401 (REQ-AUTH-001 AC-5). Le contrat le demande — `following` sur un profil est
 * calculé relativement à l'appelant et vaut `false` pour un anonyme (R-5).
 *
 * Le guard est distinct plutôt que paramétré par un booléen : deux
 * comportements aux conséquences opposées gagnent à porter deux noms, et un
 * `@UseGuards(new AuthGuard(false))` se lit mal sur la ligne d'un contrôleur.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const resolved = await resolveUserId(request, this.tokens, this.users)

    // Le motif du refus n'intéresse pas ce guard : absent ou refusé, la
    // consultation est anonyme. Il est donc ramené à `null`, la forme que le
    // décorateur et les use-cases attendent pour « pas d'appelant ».
    Reflect.set(request, CURRENT_USER_ID_KEY, isFailure(resolved) ? null : resolved)
    return true
  }
}
