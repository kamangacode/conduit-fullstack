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

  // Ni une réponse de l'API, ni un statut : réseau coupé, DNS, CORS. Rien que
  // l'utilisateur puisse corriger en changeant sa saisie.
  return ['unable to reach the server']
}
