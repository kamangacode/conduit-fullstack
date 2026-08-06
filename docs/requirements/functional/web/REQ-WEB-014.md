---
id: REQ-WEB-014
title: Créer et modifier un article depuis l'éditeur
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7.3 (création, modification) et §5 (routes `/editor`, `/editor/:slug`) ; templates.md §Create/Edit Article"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur connecté sur l'éditeur vierge"
    when: "il publie un article valide"
    then: "l'API est appelée en création et il est conduit vers l'article créé, au slug que l'API a retenu"
  - id: AC-2
    given: "un auteur qui ouvre l'éditeur sur un de ses articles"
    when: "la page s'affiche"
    then: "les champs sont pré-remplis avec l'article existant, tags compris"
  - id: AC-3
    given: "un article existant en cours de modification"
    when: "l'auteur enregistre"
    then: "l'API est appelée en modification sur le slug d'origine, et la redirection suit le slug **renvoyé**, qui peut avoir changé avec le titre"
  - id: AC-4
    given: "un champ obligatoire vide ou fait d'espaces"
    when: "l'utilisateur tente de publier"
    then: "rien n'est envoyé et les messages du schéma partagé s'affichent"
  - id: AC-5
    given: "l'éditeur"
    when: "l'utilisateur saisit un tag et valide"
    then: "le tag rejoint la liste, peut en être retiré, et n'y figure jamais en double"
  - id: AC-6
    given: "un visiteur anonyme"
    when: "il atteint l'éditeur"
    then: "il est conduit à la connexion plutôt que de saisir un article qu'il ne pourra pas publier"
  - id: AC-7
    given: "une publication refusée par l'API"
    when: "la réponse arrive"
    then: "les messages par champ du contrat §10 s'affichent et la saisie est préservée"
implementation:
  files:
    - apps/web/src/components/ArticleEditor.tsx
    - apps/web/src/app/editor/page.tsx
    - "apps/web/src/app/editor/[slug]/page.tsx"
  tests:
    - apps/web/src/components/ArticleEditor.spec.tsx
related:
  issues: [8]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-012
    - REQ-ARTICLE-003
    - REQ-ARTICLE-005
  adrs:
    - "012"
---

# REQ-WEB-014 — Créer et modifier un article depuis l'éditeur

## Contexte

L'éditeur est le seul écran du parcours où l'utilisateur **produit** du contenu
plutôt que de le consulter. Deux points y méritent d'être fixés par un critère
plutôt que laissés à l'implémentation.

Le premier est AC-3. La règle R-1 fait dériver le slug du titre : **modifier le
titre change l'URL de l'article**. Une redirection construite sur le slug
d'origine mènerait donc à une page introuvable juste après un renommage réussi —
l'auteur croirait avoir cassé son article. La redirection doit suivre le slug que
l'API renvoie, pas celui qu'on avait en main. Ce même piège a déjà coûté un
défaut côté API en F3, où le repository n'écrivait pas le slug régénéré.

Le second est AC-5 et son « jamais en double ». Le contrat n'interdit pas les
doublons dans `tagList`, et l'API les accepterait ; le résultat serait un article
affichant deux fois le même tag, ce que le lecteur lit comme un bug d'affichage.
C'est à la saisie que le cas se ferme, parce que c'est le seul endroit où
l'intention est connue.

AC-6 relève du même principe que le bouton de favori d'un anonyme : conduire à la
connexion plutôt que laisser saisir un article entier avant de découvrir qu'on ne
peut pas le publier. Le contrôle d'autorisation reste côté API — masquer un
formulaire n'est pas une sécurité.

## Règles

- La validation vient des schémas partagés (`createArticleDtoSchema`,
  `updateArticleDtoSchema`), appliqués à l'identique par l'API. Les réécrire ici
  ferait diverger les deux au premier changement.
- La modification envoie le DTO de **mise à jour**, dont tous les champs sont
  optionnels — et non le DTO de création, qui les exige tous.
- Markup `templates.md` §Create/Edit Article : `.editor-page`, `.form-control`,
  `.tag-list`, `.ion-close-round`. Le champ de tags est repéré par son
  placeholder `Enter tags` (contrat de sélecteurs).
- Le bouton porte le texte `Publish Article` dans les deux modes, comme le
  template — le contrat de sélecteurs le vise ainsi.

## Hors périmètre

- L'aperçu Markdown pendant la rédaction : absent du template de référence.
- La sauvegarde de brouillon : absente du contrat RealWorld.
- Le contrôle d'autorisation lui-même, qui appartient à l'API
  ([REQ-ARTICLE-005](../article/REQ-ARTICLE-005.md)).
