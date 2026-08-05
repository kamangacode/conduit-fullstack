import { Inject, Injectable } from '@nestjs/common'
import { jwtVerify, SignJWT } from 'jose'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import type { TokenService } from '../../domain/user/ports/token-service.port'

/**
 * Algorithme de signature, **épinglé** (ADR 007).
 *
 * L'épinglage n'est pas cosmétique : il est passé à `jwtVerify` sous
 * `algorithms`, ce qui fait rejeter tout jeton présentant un autre `alg`. Sans
 * cette liste, un attaquant peut présenter un jeton `alg: none` ou signé avec un
 * algorithme faible et espérer que la bibliothèque le suive — c'est la faille
 * historique la plus répandue des implémentations JWT.
 */
const ALGORITHM = 'HS256'

/**
 * Adapter `jose` du port `TokenService`.
 *
 * HS256 avec un secret symétrique : il n'y a qu'un émetteur et qu'un
 * vérificateur, tous deux dans ce process. RS256 n'aurait de sens que si un tiers
 * devait vérifier sans pouvoir émettre.
 */
@Injectable()
export class JoseTokenService implements TokenService {
  private readonly secret: Uint8Array
  private readonly expiresIn: string

  constructor(@Inject(ENV) env: Env) {
    // Le secret est encodé une fois à la construction. Le refaire à chaque appel
    // serait du travail inutile sur un chemin appelé à chaque requête authentifiée.
    this.secret = new TextEncoder().encode(env.JWT_SECRET)
    this.expiresIn = env.JWT_EXPIRES_IN
  }

  /**
   * Émet un jeton dont le `sub` porte l'identifiant du compte, **et rien
   * d'autre**.
   *
   * Un JWT est signé, pas chiffré : sa charge utile est lisible par quiconque
   * l'intercepte, et par le navigateur qui le stocke. Y placer l'email ou le
   * username publierait une donnée personnelle dans un jeton qui traîne en
   * `localStorage` (PRD §9), sans aucun gain — le serveur résout le compte à
   * chaque requête de toute façon.
   */
  async issue(userId: string): Promise<string> {
    return new SignJWT()
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.secret)
  }

  /**
   * Vérifie la signature et l'expiration, puis renvoie le sujet.
   *
   * Renvoie `null` sur **tout** échec — signature invalide, jeton expiré,
   * algorithme non attendu, charge utile sans sujet — sans distinguer les cas.
   * Le contrat répond 401 dans tous ces cas de toute façon, et détailler la
   * raison renseignerait un attaquant sur l'état de son jeton.
   *
   * Le `sub` est explicitement contrôlé : `jwtVerify` accepte un jeton
   * parfaitement signé dépourvu de sujet, et renvoyer `undefined` ferait
   * remonter une identité vide dans le guard.
   */
  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: [ALGORITHM] })
      return payload.sub ?? null
    } catch {
      return null
    }
  }
}
