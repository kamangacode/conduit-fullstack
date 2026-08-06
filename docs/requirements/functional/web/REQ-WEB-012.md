---
id: REQ-WEB-012
title: Afficher un article, son corps Markdown et les actions de son auteur
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7.3, §5 (route `/article/:slug`) ; templates.md §Article ; routing.md « Render markdown from server client side » ; ADR 013"
acceptance_criteria:
  - id: AC-1
    given: "un article existant"
    when: "sa page s'affiche"
    then: "le titre, la méta d'auteur, la date et les tags suivent le markup du template"
  - id: AC-2
    given: "un corps d'article en Markdown"
    when: "il est rendu"
    then: "la mise en forme est appliquée — titres, listes, emphase — et non affichée en texte brut"
  - id: AC-3
    given: "un corps d'article contenant du HTML, par exemple une balise de script"
    when: "il est rendu"
    then: "ce HTML n'est pas interprété : il n'existe aucun chemin par lequel le contenu d'un article devienne du balisage exécutable"
  - id: AC-4
    given: "un lecteur qui n'est pas l'auteur"
    when: "la page s'affiche"
    then: "les actions d'auteur — modifier, supprimer — ne lui sont pas proposées"
  - id: AC-5
    given: "l'auteur de l'article"
    when: "la page s'affiche"
    then: "il dispose des liens de modification et de suppression, et pas des boutons suivre ou favoriser son propre article"
  - id: AC-6
    given: "l'auteur qui supprime son article"
    when: "l'API confirme"
    then: "il est ramené à l'accueil, l'article ayant disparu"
  - id: AC-7
    given: "un slug inconnu"
    when: "la page est demandée"
    then: "la coquille « article introuvable » est rendue, pas un article vide"
  - id: AC-8
    given: "une panne de l'API autre qu'un article absent"
    when: "la page est demandée"
    then: "elle est annoncée comme une indisponibilité, jamais déguisée en article introuvable"
  - id: AC-9
    given: "un lecteur qui n'est pas l'auteur"
    when: "la page article s'affiche"
    then: "le bouton `Favorite Article` du contrat de sélecteurs lui est proposé avec le compteur, et l'actionner appelle l'API pour cet article"
  - id: AC-10
    given: "un lecteur connecté qui n'est pas l'auteur, sur un article qu'il n'a pas favorisé"
    when: "il actionne le bouton de favori et que l'API répond"
    then: "le bouton porte la classe `btn-primary` et le libellé `Unfavorite Article`, avec le compteur issu de la réponse"
  - id: AC-11
    given: "un article déjà favorisé par le lecteur"
    when: "la page article est rendue, puis le bouton actionné et l'API répond"
    then: "le bouton porte `btn-primary` et `Unfavorite Article` avant tout clic, puis repasse à `btn-outline-primary` et `Favorite Article`"
  - id: AC-12
    given: "une bascule de favori sur la page article qui échoue"
    when: "l'API renvoie une erreur"
    then: "la classe et le libellé restent ceux d'avant le clic — le libellé ne dérive pas de l'état plus que le compteur"
implementation:
  files:
    - apps/web/src/components/ArticleBody.tsx
    - apps/web/src/components/ArticleMeta.tsx
    - apps/web/src/components/ArticleView.tsx
    - apps/web/src/components/FavoriteButton.tsx
    - "apps/web/src/app/article/[slug]/page.tsx"
  tests:
    - apps/web/src/components/ArticleBody.spec.tsx
    - apps/web/src/components/ArticleMeta.spec.tsx
    - apps/web/src/components/ArticleView.spec.tsx
related:
  issues: [8, 12, 16]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-011
    - REQ-WEB-018
    - REQ-ARTICLE-004
    - REQ-ARTICLE-006
  adrs:
    - "012"
    - "013"
    - "020"
---

# REQ-WEB-012 — Afficher un article, son corps Markdown et les actions de son auteur

## Contexte

La page article est la **première surface de XSS stocké** du dépôt. Tout ce que
`apps/web` a affiché jusqu'ici était du texte inséré par React, donc échappé par
construction : un `<script>` dans une bio s'affiche comme du texte. Rendre du
Markdown change cette propriété, parce que rendre du Markdown, c'est produire du
balisage.

AC-3 est donc le critère central, et sa formulation est délibérée : elle ne
demande pas que le HTML soit *filtré*, mais qu'il n'existe **aucun chemin** par
lequel il devienne exécutable. C'est la différence entre une sûreté qu'on
applique et une sûreté qu'on ne peut pas oublier d'appliquer, tranchée par
l'[ADR 013](../../../adr/013-rendu-markdown-sur-par-construction.md).

Le risque est aggravé par le modèle de session : le jeton vit dans le stockage
local (ADR 014), donc lisible par tout script exécuté dans la page. Un XSS stocké
dans un article ne défigurerait pas seulement l'affichage — il exfiltrerait la
session de chaque lecteur.

AC-4 et AC-5 forment la paire habituelle des contrôles d'autorisation côté
interface. Masquer un bouton n'est **pas** une sécurité : l'API refuse déjà la
suppression par un tiers (REQ-ARTICLE-006). L'exigence porte sur ce que le
lecteur voit, pas sur ce qu'il peut faire — proposer une action qui échouera est
un défaut d'interface, l'autoriser serait un défaut de sécurité, et les deux se
traitent à des endroits différents.

AC-8 reprend une distinction déjà tenue sur la page de profil : un 404 est un
résultat, une panne n'en est pas un. Les confondre afficherait « cet article
n'existe pas » pendant une indisponibilité — un message faux, au moment le plus
coûteux pour le lecteur.

AC-10 à AC-12 ferment un manque qu'AC-9 laissait ouvert sans le vouloir : il
demandait que le bouton **existe**, pas qu'il **dise l'état**. Le composant
faisait donc basculer la classe seule et figeait le libellé à
« Favorite Article », avec un commentaire qui affirmait que le gabarit RealWorld
ne changeait que la classe. Le gabarit statique ne montre que l'état non
favorisé : il ne pouvait ni confirmer ni infirmer, et c'est le contrat de
sélecteurs qui tranche — il liste `Favorite` / `Unfavorite` comme texte de bouton
sur cette page. Un article favorisé s'annonçait donc « à favoriser ».

Les trois critères se répartissent le travail de façon délibérée : AC-10 couvre
la transition, AC-11 le **rendu initial** — un libellé qui ne basculerait qu'au
clic mentirait au rechargement — et AC-12 l'échec. Ce dernier n'est pas une
redite d'AC-6 de [REQ-WEB-011](REQ-WEB-011.md) : il étend au libellé la règle
déjà tenue par le compteur, à savoir que **rien** de ce que le bouton affiche ne
peut dériver d'un état local que l'API n'a pas confirmé.

## Règles

- Le corps est rendu **côté client**, comme la spec le demande explicitement
  (`routing.md` : « Render markdown from server client side »).
- `dangerouslySetInnerHTML` n'apparaît nulle part — propriété vérifiable d'un
  `grep`, ce qu'un assainissement correctement appelé n'est pas (ADR 013).
- Le markup suit `templates.md` §Article : `.article-page`, `.banner`,
  `.article-content`, `.article-meta`, `.tag-list` (rule 11).
- Les textes de boutons viennent du contrat de sélecteurs E2E
  (`Delete Article`, `Edit Article`, `Favorite Article` / `Unfavorite Article`).
- Sur la page article, **classe et libellé disent le même état** et viennent tous
  deux de la réponse de l'API. Le gabarit statique ne montrant qu'un seul des
  deux états, c'est `SELECTORS.md` qui fait foi sur ce point, pas
  `templates.md`.

## Hors périmètre

- **Les commentaires**, qui font l'objet d'une exigence propre malgré leur
  présence sur la même page : ils ont leur propre cycle de vie, leurs propres
  autorisations et leur propre section de template.
- L'éditeur d'article, atteint depuis cette page par un lien mais couvert
  ailleurs.
- Le contrôle d'autorisation lui-même, qui appartient à l'API
  ([REQ-ARTICLE-006](../article/REQ-ARTICLE-006.md)) : ici, seul l'affichage.
