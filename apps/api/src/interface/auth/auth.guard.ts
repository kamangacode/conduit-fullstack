import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { fieldErrors } from '@repo/shared'
import type { Request } from 'express'
import { TOKEN_SERVICE, type TokenService } from '../../domain/user/ports/token-service.port'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user/ports/user-repository.port'

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
 * Résout l'identité portée par l'en-tête `Authorization`, ou `null`.
 *
 * Trois refus distincts remontent tous `null`, sans distinction : en-tête absent
 * ou mal formé, jeton invalide ou expiré, sujet qui ne se résout plus en compte.
 * Le dernier est celui qu'on oublie — un jeton parfaitement signé peut désigner
 * un compte supprimé depuis (REQ-AUTH-001 AC-6), et faire confiance au seul `sub`
 * laisserait un fantôme agir avec l'identité d'un compte inexistant.
 */
async function resolveUserId(
  request: Request,
  tokens: TokenService,
  users: UserRepository
): Promise<string | null> {
  const header = request.headers.authorization
  if (!header) {
    return null
  }

  const [scheme, token] = header.split(' ')
  if (scheme !== AUTH_SCHEME || !token) {
    return null
  }

  const userId = await tokens.verify(token)
  if (userId === null) {
    return null
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
  return user === null ? null : user.id
}

/**
 * Corps du 401, conforme au contrat. Le message ne dit jamais *pourquoi* le
 * refus a lieu : distinguer « jeton expiré » de « signature invalide »
 * renseignerait un attaquant sur l'état de son jeton.
 */
const unauthorized = (): UnauthorizedException =>
  new UnauthorizedException(fieldErrors('authorization', 'is invalid or missing'))

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
    const userId = await resolveUserId(request, this.tokens, this.users)

    if (userId === null) {
      throw unauthorized()
    }

    // L'identité est posée sur la requête, d'où le décorateur la relira. C'est la
    // seule source d'autorité pour la suite du traitement : aucun identifiant
    // d'utilisateur n'est jamais lu dans le corps (rule 19).
    Reflect.set(request, CURRENT_USER_ID_KEY, userId)
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
    const userId = await resolveUserId(request, this.tokens, this.users)

    Reflect.set(request, CURRENT_USER_ID_KEY, userId)
    return true
  }
}
