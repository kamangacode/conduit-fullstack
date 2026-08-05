import { type PipeTransform, UnprocessableEntityException } from '@nestjs/common'
import { toErrorResponse } from '@repo/shared'
import type { ZodType } from 'zod'

/**
 * Valide un corps de requête avec un schéma Zod de `packages/shared`.
 *
 * Une vingtaine de lignes plutôt qu'une dépendance : ce que ferait une
 * bibliothèque tierce ici, c'est exactement ce qu'on ne veut pas — imposer sa
 * propre forme d'erreur. Le contrat RealWorld exige un corps très particulier
 * (`{"errors":{"champ":["message"]}}`, PRD §10), et `toErrorResponse` le produit
 * déjà à partir d'une `ZodError`. Adapter une lib à ce format coûterait plus que
 * cette classe.
 *
 * La conséquence qui compte : **les règles de validation ne sont écrites qu'une
 * fois**, dans `packages/shared`, et le front applique les mêmes. Un message
 * affiché sous un champ de formulaire est le message que l'API aurait produit.
 *
 * Non exportée : tous les corps du contrat sont enveloppés (`{ user: … }`), donc
 * les contrôleurs passent par `zodEnvelope`. Exporter cette classe offrirait un
 * second chemin, qui produirait des clés d'erreur préfixées (`user.email`) sans
 * que rien ne le signale.
 */
class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)

    if (!result.success) {
      // 422 explicite : le défaut de NestJS pour un corps invalide est 400, que
      // le contrat ne prévoit pas.
      throw new UnprocessableEntityException(toErrorResponse(result.error))
    }

    return result.data
  }
}

/**
 * Fabrique un pipe pour un schéma **enveloppé** (`{ user: … }`) tout en produisant
 * des clés d'erreur **déballées** (`email`, pas `user.email`).
 *
 * Le contrat impose les deux à la fois : le corps de requête est enveloppé
 * (PRD §7.1), les clés d'erreur ne le sont pas (PRD §10). Valider directement
 * avec le schéma enveloppé produirait `{"errors":{"user.email":[…]}}`, que le
 * front ne saurait rapprocher d'aucun champ de formulaire.
 *
 * On valide donc l'enveloppe en deux temps : sa présence d'abord, son contenu
 * ensuite avec le schéma déballé — ce dernier étant celui dont les chemins
 * d'erreur sont corrects.
 */
export function zodEnvelope<T>(key: string, inner: ZodType<T>): PipeTransform<unknown, T> {
  const innerPipe = new ZodValidationPipe(inner)

  return {
    transform(value: unknown): T {
      const envelope = value as Record<string, unknown> | null | undefined
      // Une enveloppe absente n'a pas de champ fautif à nommer : elle est
      // rattachée à la clé racine du contrat (`body`), comme l'exemple verbatim
      // de la spec `{"errors":{"body":["can't be empty"]}}`.
      const inner = envelope?.[key]

      return innerPipe.transform(inner)
    },
  }
}
