import { NO_BODY, OUT_OF_CONTRACT, ROUTE_CONTRACTS } from './route-contracts'

/**
 * L'assertion de contrat, dans ses **deux** directions (REQ-ARCH-002, ADR 026).
 *
 * Le dépôt vérifiait jusqu'ici ses réponses ainsi :
 *
 * ```ts
 * expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
 * ```
 *
 * Zod **retire** les clés inconnues d'un `z.object` au lieu de les refuser :
 * cette assertion est donc vraie d'un corps qui porterait en plus le condensat
 * argon2 d'un compte. Le parse les écarte de `result.data`, que l'assertion ne
 * regarde pas, pendant que `response.body` — celui qui part au client — les
 * conserve.
 *
 * D'où la forme retenue : le corps doit passer le schéma **et** rester inchangé
 * par le parse. Ce second membre est la preuve d'absence de clé inconnue, sans
 * rendre le contrat lui-même strict (ce qui casserait un front déployé face à
 * une API plus récente — ADR 026, option B écartée).
 *
 * Le typage ne rend pas ce contrôle superflu : `tsc` refuse un champ **nommé**
 * en trop dans un littéral, mais accepte `{ ...row }` où `row` est une ligne de
 * persistance plus large que le contrat. La seule fuite réellement possible est
 * donc exactement celle que le compilateur ne voit pas.
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Chemins présents dans le corps reçu et absents de ce que le schéma a retenu.
 *
 * On compare au **résultat du parse** plutôt qu'aux clés déclarées du schéma :
 * cela évite d'avoir à introspecter Zod, et couvre gratuitement les objets
 * imbriqués et les éléments de liste, où se logent les fuites les plus
 * plausibles (l'`author` d'un commentaire, par exemple).
 */
const excessPaths = (received: unknown, retained: unknown, path = ''): string[] => {
  if (Array.isArray(received) && Array.isArray(retained)) {
    return received.flatMap((item, index) =>
      excessPaths(item, retained[index], `${path}[${index}]`)
    )
  }

  if (!(isPlainObject(received) && isPlainObject(retained))) return []

  return Object.keys(received).flatMap((key) => {
    const here = path ? `${path}.${key}` : key
    return key in retained ? excessPaths(received[key], retained[key], here) : [here]
  })
}

/**
 * Confronte un corps de réponse au contrat de sa route.
 *
 * Rend `null` si le corps est conforme, sinon le motif du refus — une chaîne
 * lisible qui **nomme** ce qui cloche, parce qu'un harnais qui dit seulement
 * « non conforme » se fait désactiver le jour où il attrape quelque chose.
 *
 * Une route absente du registre est un refus, jamais un laissez-passer : c'est
 * la moitié runtime de la garantie de complétude, l'autre étant le contrôle au
 * démarrage de `contract-registry-check.ts`.
 */
export function contractViolation(key: string, body: unknown): string | null {
  const entry = ROUTE_CONTRACTS[key]

  if (entry === undefined) {
    return `route « ${key} » absente du registre de contrat : déclare son enveloppe dans route-contracts.ts, ou marque-la OUT_OF_CONTRACT si elle ne relève pas du contrat Conduit.`
  }

  if (entry === OUT_OF_CONTRACT) return null

  if (entry === NO_BODY) {
    return body === undefined
      ? null
      : `route « ${key} » déclarée sans corps, or elle en a rendu un : ${JSON.stringify(body)}`
  }

  const parsed = entry.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(racine)'} — ${issue.message}`)
      .join(' ; ')
    return `route « ${key} » : le corps ne satisfait pas son schéma → ${issues}`
  }

  const excess = excessPaths(body, parsed.data)
  if (excess.length > 0) {
    return `route « ${key} » : champs hors contrat rendus au client → ${excess.join(', ')}`
  }

  return null
}
