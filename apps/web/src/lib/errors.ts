import { ApiError } from './api-client'

/**
 * Champ que le guard d'authentification porte sur **tout** 401 de route
 * protégée (REQ-ERROR-002 AC-3/AC-4) — jamais un autre, quelle que soit la
 * cause (jeton absent, invalide, expiré, ou dont le sujet ne résout plus).
 *
 * Il ne correspond à aucune saisie du formulaire — aucun champ ne s'appelle
 * « token » sur `/editor`, `/settings` ou ailleurs — donc son message
 * (« is invalid », « is missing ») n'est **pas exploitable** au sens où AC-3
 * l'entend : rien que l'utilisateur puisse corriger en le lisant. La page a un
 * message qui, lui, dit quoi faire (REQ-WEB-019 AC-1) ; c'est celui-là qui doit
 * s'afficher, pas la formulation du contrat destinée à ne renseigner personne
 * sur l'état de son jeton.
 *
 * Distinct du 401 de `/users/login`, qui porte `credentials` — jamais `token`
 * (REQ-ERROR-002 AC-5) — et que cette règle ne touche donc pas : `AuthForm`
 * continue de recevoir le détail de l'API.
 */
const SESSION_FAILURE_FIELD = 'token'

/**
 * Traduit une erreur en messages affichables.
 *
 * Les deux formulaires portaient chacun leur copie de cette fonction, et elles
 * **avaient déjà divergé** : `AuthForm` traduisait le 401 en « email or
 * password is invalid », `SettingsForm` retombait sur « request failed ». Un
 * utilisateur dont la session expirait pendant qu'il modifiait son compte
 * recevait donc un message qui ne lui disait rien de ce qu'il devait faire.
 *
 * `ErrorMessages` — la moitié « affichage » — avait été extraite précisément
 * pour éviter ce genre de dérive ; la moitié « traduction » ne l'avait pas été,
 * et la dérive est arrivée là.
 *
 * Les messages par champ du contrat (§10) sont rendus tels quels : ils sont
 * rédigés pour l'utilisateur. Un statut sans détail retombe sur la table
 * fournie par l'appelant, qui seul sait si un 401 mérite un message particulier
 * sur sa page.
 *
 * **Exception au-dessus** : un 401 dont le détail porte le champ `token` prend
 * le message générique de la page quand elle en fournit un. Sans cette
 * exception, la table de messages d'une page authentifiée
 * (`EDITOR_MESSAGES[401]`, par exemple) ne se déclenchait **jamais** contre la
 * vraie API : le guard renvoie toujours `{ errors: { token: […] } }`, jamais un
 * objet vide, donc la branche « statut sans détail » n'était atteinte qu'avec
 * les doublures de test qui construisaient une `ApiError(401, {})` — une forme
 * que l'API elle-même ne produit pas.
 */
export function toMessages(
  error: unknown,
  genericMessages: Readonly<Record<number, string>> = {}
): string[] {
  if (error instanceof ApiError) {
    const generic = genericMessages[error.status]

    if (generic !== undefined && SESSION_FAILURE_FIELD in error.errors) {
      return [generic]
    }

    const detailed = error.messages
    if (detailed.length > 0) {
      return detailed
    }
    return [generic ?? 'request failed']
  }

  // Ni une réponse de l'API, ni un statut : réseau coupé, DNS, CORS, corps
  // illisible. Rien que l'utilisateur puisse corriger en changeant sa saisie —
  // et rien que le contrat §10 puisse décrire, puisque rien n'est revenu.
  return [CONNECTION_FAILURE_MESSAGE]
}

/**
 * Message des échecs de transport (REQ-WEB-017 AC-1).
 *
 * **Sa formulation est un élément de contrat**, pas un choix de ton : la suite
 * e2e officielle l'assert littéralement, au même titre qu'un sélecteur
 * (REQ-WEB-007). La reformuler casserait la suite sans rien casser dans
 * l'application — le mode d'échec exact que le contrat de sélecteurs documente.
 *
 * Il n'a en revanche rien à faire dans `@repo/shared` : l'ADR 017 y range les
 * messages que **l'API émet**, et celui-ci décrit précisément le cas où elle
 * n'émet rien.
 *
 * Exporté pour que les tests le désignent au lieu de le recopier : une copie
 * dans une assertion laisserait la suite verte au premier changement de
 * formulation, ce qui est exactement ce que ce message ne doit pas permettre.
 */
export const CONNECTION_FAILURE_MESSAGE = 'Unable to connect to the server, please try again'
