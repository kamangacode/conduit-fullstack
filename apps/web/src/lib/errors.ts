import { ApiError } from './api-client'

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
 */
export function toMessages(
  error: unknown,
  genericMessages: Readonly<Record<number, string>> = {}
): string[] {
  if (error instanceof ApiError) {
    const detailed = error.messages
    if (detailed.length > 0) {
      return detailed
    }
    return [genericMessages[error.status] ?? 'request failed']
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
