/**
 * Date affichée par les méta d'article et de commentaire.
 *
 * Le contrat transporte une chaîne ISO 8601 et non un `Date` : c'est la seule
 * forme sur laquelle l'API et le front s'accordent sans sérialiseur
 * intermédiaire.
 *
 * **Deux paramètres sont figés, et il a fallu une revue pour voir le second.**
 * Le rendu serveur et le rendu client doivent produire le même texte, sans quoi
 * React signale une divergence d'hydratation :
 *
 * - `en-US` — la locale. Elle était déjà figée, avec le bon raisonnement.
 * - `UTC` — le fuseau. Il ne l'était pas, alors que le vecteur est strictement
 *   analogue : sans lui, `toLocaleDateString` résout le jour dans le fuseau du
 *   **moteur d'exécution**. Pour un article créé entre 20 h et minuit UTC, le
 *   serveur (souvent en UTC) et un lecteur en fuseau positif n'affichent pas le
 *   même jour. Raisonner sur la locale et oublier le fuseau, c'est fermer une
 *   porte et laisser l'autre ouverte.
 *
 * Extrait ici parce que la fonction existait en **trois copies identiques**.
 * Trois copies, c'est trois endroits où corriger le fuseau — et deux occasions
 * de l'oublier.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
