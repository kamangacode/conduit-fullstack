import { type ApiClient, createApiClient } from './api-client'
import { API_BASE_URL } from './env'

/**
 * Client API des Server Components — **anonyme par construction**.
 *
 * Les deux options qu'il fixe portent chacune un invariant du dépôt, et c'est
 * la raison d'être de ce module :
 *
 * - `getToken: () => null` **est** la décision de l'[ADR 012] rendue exécutable :
 *   le jeton ne quitte jamais le navigateur, donc le serveur rend toujours la
 *   vue d'un lecteur non identifié. `following` et `favorited` y valent `false`,
 *   ce que la règle R-5 prescrit — ce n'est pas un pis-aller.
 * - `cache: 'no-store'` : le contenu Conduit change à chaque publication, et
 *   servir une version mise en cache afficherait un état périmé juste après une
 *   modification.
 *
 * Ce littéral était recopié à l'identique dans six Server Components. L'ADR 015
 * a pourtant écarté une option entière au motif que deux chemins parallèles
 * dérivent sans que rien ne le rappelle — le même raisonnement s'applique ici,
 * et n'avait pas été appliqué. Un seul site où l'anonymat du serveur se décide
 * vaut mieux que six endroits où il se redécide.
 */
export function createServerApiClient(): ApiClient {
  return createApiClient({
    baseUrl: API_BASE_URL,
    getToken: () => null,
    fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  })
}
