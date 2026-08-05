---
id: REQ-WEB-011
title: Rendre un aperçu d'article et sa bascule de favori dans une liste
type: functional
domain: web
status: approved
priority: must
source: "PRD §7.3 (favoris), §8 (format d'article), règle R-5 ; templates.md §Home (`.article-preview`) ; contrat de sélecteurs E2E (états de bouton)"
acceptance_criteria:
  - id: AC-1
    given: "un aperçu d'article"
    when: "il est rendu"
    then: "il porte le markup du template — auteur, date, tags — et son lien mène à `/article/{slug}`"
  - id: AC-2
    given: "un article que le lecteur n'a pas favorisé"
    when: "le bouton de favori est rendu"
    then: "il porte `btn-outline-primary` et affiche le compteur de favoris"
  - id: AC-3
    given: "un article déjà favorisé par le lecteur"
    when: "le bouton de favori est rendu"
    then: "il porte `btn-primary`, la classe que le contrat associe à l'état favorisé"
  - id: AC-4
    given: "un utilisateur connecté qui bascule un favori"
    when: "l'API répond"
    then: "l'état et le compteur affichés viennent de la réponse, jamais d'un incrément local"
  - id: AC-5
    given: "un visiteur anonyme"
    when: "il tente de favoriser"
    then: "il est conduit à la connexion, sans qu'aucun appel ne parte"
  - id: AC-6
    given: "une bascule de favori qui échoue"
    when: "l'API renvoie une erreur"
    then: "l'état affiché reste celui d'avant le clic et l'échec est signalé — le compteur ne dérive pas"
  - id: AC-7
    given: "un aperçu d'article sans tag"
    when: "il est rendu"
    then: "la liste de tags est simplement vide, sans élément résiduel ni erreur"
implementation:
  files: []
  tests: []
related:
  issues: [6]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-009
    - REQ-ARTICLE-009
  adrs:
    - "012"
---

# REQ-WEB-011 — Rendre un aperçu d'article et sa bascule de favori dans une liste

## Contexte

L'aperçu est le composant le plus **répété** de l'application : il apparaît sur
l'accueil, sur la page d'un tag et sur les deux onglets du profil. C'est aussi
celui qui porte une action — la bascule de favori — au milieu d'une liste rendue
côté serveur. La frontière de l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)
y passe donc *à l'intérieur* d'un élément de liste : le contenu est public, le
bouton dépend du lecteur (règle R-5).

AC-4 et AC-6 disent la même chose sous deux angles, et c'est délibéré. Une
bascule optimiste — incrémenter le compteur au clic — est le réflexe naturel et
produit une dérive silencieuse : au premier échec, l'affichage et la base ne
disent plus la même chose, et rien ne les resynchronise avant un rechargement.
Faire foi de la réponse coûte un aller-retour visible et rend l'état impossible à
désynchroniser. Le même parti pris a déjà été retenu pour le bouton de suivi en
F4, pour les mêmes raisons.

AC-2 et AC-3 ne sont pas cosmétiques : le contrat de sélecteurs E2E **définit
l'état favorisé par la classe** (`btn-outline-primary` non favorisé,
`btn-primary` favorisé). Les inverser produit une interface qui a l'air correcte
et une suite de tests qui affirme le contraire de la réalité.

## Règles

- L'aperçu consomme la forme **sans corps** (`ArticleSummary`, règle R-7) : y
  attendre `body` ferait afficher `undefined` sur une page pourtant complète.
- Le compteur affiché est toujours `favoritesCount` tel que l'API le renvoie.
- Le markup suit `templates.md` : `.article-preview`, `.article-meta`,
  `.preview-link`, `.tag-list` (rule 11).
- L'avatar de l'auteur suit le repli de [REQ-WEB-007](REQ-WEB-007.md) AC-3.

## Hors périmètre

- La page article elle-même et ses actions d'auteur : exigence propre, écrite au
  moment où la page sera construite.
- La liste qui contient les aperçus et sa pagination
  ([REQ-WEB-009](REQ-WEB-009.md), [REQ-WEB-010](REQ-WEB-010.md)).
- Le suivi de l'auteur depuis un aperçu : le template de référence ne le propose
  pas à cet endroit.
