'use client'

import Markdown from 'react-markdown'

/**
 * Corps d'article en Markdown (REQ-WEB-012 AC-2/AC-3, [ADR 013]).
 *
 * C'est la **première surface de XSS stocké** du dépôt. Tout ce que `apps/web`
 * affichait jusqu'ici était du texte inséré par React, donc échappé par
 * construction ; rendre du Markdown change cette propriété, parce que rendre du
 * Markdown c'est produire du balisage.
 *
 * La sûreté ne vient pas d'une étape d'assainissement mais de la **forme du
 * résultat** : `react-markdown` construit un arbre d'éléments React et n'expose
 * jamais de chaîne HTML au DOM. Il n'y a donc rien à assainir, et rien à oublier
 * d'assainir — le HTML brut contenu dans le Markdown est ignoré par défaut, et
 * ce défaut est conservé tel quel. Activer `rehype-raw` rouvrirait exactement le
 * vecteur que l'ADR 013 ferme.
 *
 * Conséquence à tenir dans tout le dépôt : `dangerouslySetInnerHTML`
 * n'apparaît nulle part, propriété vérifiable d'un `grep` — ce qu'un
 * assainissement correctement appelé n'est pas.
 *
 * Rendu **côté client** parce que la spec le demande explicitement
 * (`routing.md` : « Render markdown from server client side »), et parce que
 * l'aperçu de l'éditeur exigera de toute façon un rendu client : un seul chemin
 * de rendu, donc aucun écart possible entre ce que l'auteur voit en écrivant et
 * ce que le lecteur verra.
 */
export function ArticleBody({ body }: { body: string }) {
  return <Markdown>{body}</Markdown>
}
