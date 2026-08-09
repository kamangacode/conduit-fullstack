import { ROUTE_CONTRACTS } from './route-contracts'

/**
 * Contrôle de **complétude** du registre de contrat (REQ-ARCH-002 AC-4).
 *
 * L'intercepteur ne voit que les réponses qui passent, donc que les routes
 * qu'un test exerce. Une route ajoutée demain et laissée sans test échapperait
 * entièrement au harnais, et son absence ne se verrait nulle part — c'est
 * exactement l'angle mort que l'item C3 doit fermer.
 *
 * Ces deux fonctions comparent donc le registre aux routes **réellement
 * montées** par l'application, dans les deux sens. Elles sont pures et prennent
 * la liste des clés en argument : c'est ce qui les rend testables dans la lane
 * unit, sans base ni application NestJS.
 */

/**
 * Routes montées par l'application et déclarées nulle part.
 *
 * C'est le sens qui protège : une route non déclarée est une réponse dont
 * personne n'a écrit ce qu'elle a le droit de contenir.
 */
export const undeclaredRoutes = (mounted: readonly string[]): string[] =>
  mounted.filter((key) => !(key in ROUTE_CONTRACTS)).sort()

/**
 * Déclarations sans route correspondante — l'entrée d'une route renommée ou
 * supprimée, restée derrière.
 *
 * Ce sens ne protège d'aucune fuite, mais il empêche le registre de pourrir :
 * un fichier qui décrit des routes qui n'existent plus finit par n'être relu
 * par personne, et c'est ainsi qu'une déclaration manquante passe inaperçue.
 */
export const staleContracts = (mounted: readonly string[]): string[] =>
  Object.keys(ROUTE_CONTRACTS)
    .filter((key) => !mounted.includes(key))
    .sort()
