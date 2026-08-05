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
