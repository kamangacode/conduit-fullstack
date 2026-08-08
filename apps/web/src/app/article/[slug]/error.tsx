'use client'

import { ArticlePageNotice } from '../../../components/ArticlePageNotice'

/**
 * L'API a refusé, ou n'a pas répondu (REQ-WEB-018 AC-2).
 *
 * Une frontière d'erreur **de segment** et non de racine : elle remplace la
 * page, pas la coquille applicative, donc la barre de navigation et le pied de
 * page restent en place et le visiteur n'est pas enfermé.
 *
 * `'use client'` est imposé par Next — une frontière d'erreur doit pouvoir se
 * réinitialiser côté navigateur. Le composant reste sans état pour autant.
 *
 * Ni `error` ni `reset` ne sont consommés, et c'est délibéré : afficher le
 * message d'une exception serveur exposerait un détail d'implémentation, et
 * proposer « réessayer » rejouerait le même rendu contre la même API en rade.
 * Le rechargement du navigateur remplit ce rôle sans bouton supplémentaire.
 */
export default function ArticleError() {
  return <ArticlePageNotice kind="unavailable" />
}
