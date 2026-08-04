import { z } from 'zod'

/**
 * Clé utilisée quand l'erreur ne porte sur aucun champ identifiable — c'est
 * celle de l'exemple verbatim de la spec : `{"errors":{"body":["can't be
 * empty"]}}` (PRD §10).
 */
export const ROOT_ERROR_KEY = 'body'

/**
 * Enveloppe d'erreur de validation du contrat (PRD §10) : la clé `errors` mappe
 * des noms de champs vers des **tableaux** de messages, jamais vers un message
 * seul — un même champ peut violer plusieurs règles à la fois.
 */
export const errorResponseSchema = z.object({
  errors: z.record(z.string(), z.array(z.string()).min(1)),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/**
 * Traduit une `ZodError` en enveloppe d'erreur RealWorld.
 *
 * C'est la fonction qui justifie le package partagé : l'API s'en sert pour
 * produire ses 422, le front pour afficher les messages sous les champs de
 * formulaire. Une règle de validation produit donc **un seul** message, où
 * qu'elle soit évaluée — au lieu d'un message serveur et d'un message client
 * qui divergent au premier changement.
 *
 * Le schéma passé au parse doit être le DTO **déballé** (`loginDtoSchema`), pas
 * son enveloppe (`loginRequestSchema`) : sinon les clés produites seraient
 * `user.email` là où la spec attend `email`.
 */
export function toErrorResponse(error: z.ZodError): ErrorResponse {
  const errors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : ROOT_ERROR_KEY
    const messages = errors[key] ?? []

    messages.push(issue.message)
    errors[key] = messages
  }

  return { errors }
}

/**
 * Construit une enveloppe d'erreur pour une règle que Zod ne peut pas exprimer,
 * parce qu'elle demande d'interroger la base : unicité de l'email ou du
 * username (règle R-8), par exemple.
 *
 * La signature exige au moins un message : le contrat interdit un tableau vide,
 * et le faire respecter par le type plutôt que par un contrôle à l'exécution
 * supprime le cas d'erreur au lieu de le gérer.
 */
export function fieldErrors(
  field: string,
  message: string,
  ...moreMessages: string[]
): ErrorResponse {
  return { errors: { [field]: [message, ...moreMessages] } }
}
