import { ArticlePageNotice } from '../../../components/ArticlePageNotice'

/**
 * Slug inconnu (REQ-WEB-018 AC-1).
 *
 * Le `notFound()` de la page conserve son **statut 404** — c'est ce fichier qui
 * change seulement ce que le visiteur lit. Rendre la coquille depuis la page
 * elle-même aurait répondu 200 sur un article inexistant, et appris à un moteur
 * d'indexation qu'une page vide est une page valide.
 */
export default function NotFound() {
  return <ArticlePageNotice kind="missing" />
}
