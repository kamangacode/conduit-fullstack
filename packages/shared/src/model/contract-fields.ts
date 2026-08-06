import { z } from 'zod'
import { CONTRACT_MESSAGES, type ContractMessage } from '../errors/contract-messages'

/**
 * Les fragments de schéma qui portent les messages du contrat.
 *
 * Ils existent pour que le message d'un champ obligatoire soit écrit **une
 * fois**. Le laisser à chaque déclaration de DTO est ce qui a produit le défaut
 * d'origine : sept champs répartis dans trois modules, aucun ne portant de
 * message, et le message par défaut de Zod partant au client à leur place
 * (ADR 017).
 *
 * Ce sont des fonctions et non des constantes parce qu'un schéma Zod est
 * mutable par chaînage : partager une instance ferait qu'un `.optional()` posé
 * sur un DTO se retrouverait ailleurs.
 */

/**
 * Texte obligatoire du contrat : présent, et non réduit à des espaces.
 *
 * `.trim()` avant `.min(1)` est ce qui rend `"   "` équivalent à `""`. Sans lui,
 * un titre d'article fait de trois espaces serait accepté, publierait un article
 * sans titre lisible et lui donnerait un slug de repli.
 */
export const requiredText = () => z.string().trim().min(1, CONTRACT_MESSAGES.blank)

/**
 * Email du contrat, dont **le vide se contrôle avant le format**.
 *
 * C'est la subtilité que la suite de conformité a révélée : `z.email()` refuse
 * bien la chaîne vide, mais au motif du format. Le contrat veut le motif du vide
 * (`errors_auth.hurl`, « Register empty email »). Un champ vide est vide avant
 * d'être malformé, et l'ordre des contrôles est donc une propriété observable —
 * pas un détail d'implémentation (REQ-ERROR-002 AC-2).
 *
 * Le message reste conditionné à l'entrée plutôt que d'être posé par un
 * `.min(1)` en amont : un `.pipe()` court-circuiterait le contrôle de format et
 * ferait perdre le motif propre aux emails non vides mais malformés.
 */
export const contractEmail = () =>
  z.email({
    error: (issue) =>
      issue.input === '' ? CONTRACT_MESSAGES.blank : CONTRACT_MESSAGES.emailInvalid,
  })

/**
 * Texte obligatoire soumis à une longueur minimale — le mot de passe.
 *
 * Les deux contrôles sont chaînés plutôt que fusionnés en un seul `.min(n)` :
 * une valeur vide viole les deux règles, et le contrat veut lire « can't be
 * blank » en premier. Un `.min(8)` seul répondrait « trop court » à un champ
 * qu'on n'a pas rempli, ce qui décrit mal ce qui s'est passé.
 *
 * Le message est un `ContractMessage` et non un `string` : la table est la seule
 * source de messages sur le fil (ADR 017), et un libellé écrit à l'appel ne doit
 * pas compiler.
 */
export const minLengthText = (minimum: number, tooShortMessage: ContractMessage) =>
  z.string().min(1, CONTRACT_MESSAGES.blank).min(minimum, tooShortMessage)

/**
 * Champ nullable du contrat, pour lequel **une chaîne vide est une absence**.
 *
 * Le contrat distingue trois intentions sur un tel champ — omettre (ne pas
 * toucher), envoyer `null` (effacer), envoyer `""` (effacer aussi). C'est la
 * troisième qui manquait, et son absence produisait un état que le modèle
 * n'annonce pas : une bio valant `""` là où le type dit `string | null`
 * (REQ-USER-005).
 *
 * La normalisation vit ici, donc en amont du domaine, qui continue de ne voir
 * que deux cas. Elle ne s'applique **jamais** aux champs obligatoires : les y
 * étendre créerait un compte sans nom.
 */
export const nullableText = () =>
  z
    .string()
    .nullable()
    .transform((value) => (value === '' ? null : value))
