/**
 * URL de l'API Conduit, source unique.
 *
 * Elle était déclarée deux fois — dans `api-provider.tsx` et dans la page de
 * profil — avec la même valeur de repli. Deux constantes identiques ne posent
 * aucun problème jusqu'au jour où l'une des deux change.
 *
 * Le préfixe `NEXT_PUBLIC_` est une nécessité, pas un oubli : le navigateur doit
 * connaître cette URL pour appeler l'API. Rien de secret n'y transite — le
 * jeton voyage dans un en-tête, jamais dans l'URL (REQ-WEB-001 AC-2).
 *
 * La valeur de repli vise le port de développement d'`apps/api`, pour qu'un
 * `pnpm dev` fraîchement cloné fonctionne sans configuration préalable.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

/**
 * URL de l'API vue **depuis le serveur de rendu**.
 *
 * Le navigateur et le processus Next n'atteignent pas nécessairement l'API par
 * le même chemin. Le premier a besoin d'une URL publiquement résolvable ; le
 * second tourne à côté de l'API et gagne à l'appeler directement — sans passer
 * par le DNS public, le TLS et l'éventuel répartiteur de charge qui séparent le
 * navigateur du service.
 *
 * Le repli sur `API_BASE_URL` garde le cas simple simple : une seule variable
 * suffit tant que les deux chemins coïncident, ce qui est le cas en
 * développement comme dans le déploiement actuel.
 *
 * L'exécution e2e est le premier contexte où ils divergent, et la divergence y
 * est structurelle : la suite officielle vendorée intercepte un hôte figé
 * (`api.realworld.show`), que le **navigateur** doit donc appeler, tandis que le
 * rendu serveur doit continuer de viser l'API locale — sans quoi il interrogerait
 * la démo publique par-dessus l'internet ([ADR 019]).
 */
export const SERVER_API_BASE_URL = process.env.SERVER_API_URL ?? API_BASE_URL
