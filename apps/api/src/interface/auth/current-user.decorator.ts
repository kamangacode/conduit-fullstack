import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { CURRENT_USER_ID_KEY } from './auth.guard'

/**
 * Identité de l'appelant sur une route **protégée**.
 *
 * Lit ce que `AuthGuard` a posé sur la requête après vérification — donc une
 * valeur qui a traversé la signature du jeton *et* la résolution en base. C'est
 * le seul chemin par lequel une identité entre dans un contrôleur : elle n'est
 * jamais lue dans le corps ni dans l'URL (rule 19, server-side authority).
 *
 * Le `throw` n'est pas défensif au sens habituel : il attrape une erreur de
 * **câblage**, celle d'un contrôleur qui utiliserait ce décorateur sans avoir
 * posé `@UseGuards(AuthGuard)`. Sans lui, l'identité serait `undefined` et
 * remonterait silencieusement jusqu'au use-case, qui chercherait un compte
 * d'identifiant vide et répondrait 401 — un symptôme qui désigne l'utilisateur
 * là où la faute est dans la déclaration de la route.
 */
export const CurrentUserId = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<Request>()
  const userId = Reflect.get(request, CURRENT_USER_ID_KEY)

  if (typeof userId !== 'string') {
    throw new Error(
      'CurrentUserId est utilisé sur une route sans AuthGuard : ' +
        'aucune identité vérifiée n’a été posée sur la requête.'
    )
  }

  return userId
})

/**
 * Identité de l'appelant sur une route à authentification **optionnelle**, ou
 * `null` s'il est anonyme.
 *
 * Type de retour `string | null` et non `string | undefined` : `null` est une
 * valeur que le use-case attend et traite (R-5), là où `undefined` se confondrait
 * avec un oubli de câblage.
 */
export const OptionalCurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>()
    const userId = Reflect.get(request, CURRENT_USER_ID_KEY)

    return typeof userId === 'string' ? userId : null
  }
)
