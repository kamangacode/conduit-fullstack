/**
 * Liste d'erreurs `.error-messages` du markup RealWorld (rule 11).
 *
 * Partagée par les formulaires d'authentification et de paramètres : les deux
 * affichaient le même bloc, et deux copies d'un même markup finissent par
 * diverger — l'une gagne une classe, l'autre pas, et le CSS de référence ne
 * s'accroche plus qu'à moitié.
 *
 * Elle reçoit des messages **déjà aplatis** : décider comment un `ErrorResponse`
 * du contrat §10 devient une phrase appartient à l'appelant, qui seul sait si
 * un statut mérite un message générique.
 */
export function ErrorMessages({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) {
    return null
  }

  return (
    <ul className="error-messages">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}
