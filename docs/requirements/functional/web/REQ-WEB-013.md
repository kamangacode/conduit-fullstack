---
id: REQ-WEB-013
title: Lister, publier et supprimer les commentaires d'un article
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7.4 (endpoints commentaires) ; templates.md §Article ; contrat de sélecteurs E2E (`.card:not(.comment-form) .card-block`, `.mod-options`)"
acceptance_criteria:
  - id: AC-1
    given: "un article avec des commentaires"
    when: "sa page s'affiche"
    then: "chaque commentaire apparaît avec son corps, son auteur et sa date, dans le markup du template"
  - id: AC-2
    given: "un visiteur anonyme"
    when: "il atteint la section des commentaires"
    then: "aucun formulaire ne lui est proposé, mais des liens de connexion et d'inscription"
  - id: AC-3
    given: "un utilisateur connecté"
    when: "il publie un commentaire"
    then: "le commentaire renvoyé par l'API rejoint la liste sans rechargement, et le champ se vide"
  - id: AC-4
    given: "un commentaire vide ou fait d'espaces"
    when: "l'utilisateur tente de le publier"
    then: "rien n'est envoyé — la règle du schéma partagé est appliquée avant l'appel"
  - id: AC-5
    given: "un commentaire dont le lecteur n'est pas l'auteur"
    when: "il est affiché"
    then: "aucune commande de suppression ne lui est proposée"
  - id: AC-6
    given: "un commentaire dont le lecteur est l'auteur"
    when: "il le supprime"
    then: "le commentaire disparaît de la liste sans rechargement"
  - id: AC-7
    given: "une publication ou une suppression qui échoue"
    when: "l'API renvoie une erreur"
    then: "l'échec est signalé et la liste reste conforme à ce que l'API a confirmé"
implementation:
  files:
    - apps/web/src/components/CommentSection.tsx
    - "apps/web/src/app/article/[slug]/page.tsx"
  tests:
    - apps/web/src/components/CommentSection.spec.tsx
related:
  issues: [8]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-012
    - REQ-COMMENT-002
    - REQ-COMMENT-003
  adrs:
    - "012"
---

# REQ-WEB-013 — Lister, publier et supprimer les commentaires d'un article

## Contexte

Les commentaires occupent la fin de la page article mais forment une exigence
distincte, et ce découpage n'est pas cosmétique : ils ont leur propre cycle de
vie (liste rechargée, ajout, retrait sans quitter la page), leurs propres
autorisations (l'auteur du **commentaire**, pas celui de l'article) et leur
propre section de template.

AC-5 fixe une confusion facile à commettre : la commande de suppression d'un
commentaire appartient à l'auteur **du commentaire**, alors que la page entière
est cadrée par l'auteur **de l'article**. Réutiliser le contrôle de
[REQ-WEB-012](REQ-WEB-012.md) AC-4 donnerait à l'auteur d'un article le droit
apparent de supprimer les commentaires d'autrui — que l'API refuserait, produisant
une interface qui promet ce qu'elle ne peut pas tenir.

AC-4 s'appuie sur le schéma partagé plutôt que sur une règle réécrite ici : le
corps d'un commentaire ne peut pas être vide, et cette règle vit dans
`@repo/shared`, appliquée à l'identique par l'API. La revalider localement
ferait diverger les deux au premier changement.

Le markup mérite une attention particulière parce que le contrat de sélecteurs
**compte** les commentaires par `.card:not(.comment-form) .card-block` : le
formulaire porte donc la classe `comment-form` en plus de `card`, faute de quoi
il serait décompté comme un commentaire. C'est le même mode d'échec que celui
rencontré sur la liste d'articles, où un indicateur de chargement portait la
classe des aperçus.

## Règles

- Le corps est du **texte**, pas du Markdown : le template n'en prévoit pas le
  rendu, et l'insérer par React le laisse échappé par construction.
- Les autorisations restent côté API ([REQ-COMMENT-003](../comment/REQ-COMMENT-003.md)) :
  masquer une commande est une question d'interface, pas de sécurité.
- La suppression passe par le chemin imbriqué dans l'article, seul moyen pour
  l'API de vérifier que le commentaire lui appartient (motif IDOR, rule 19).
- Markup `templates.md` §Article : `.card`, `.card-block`, `.card-footer`,
  `.comment-author`, `.comment-author-img`, `.mod-options`.

## Hors périmètre

- L'édition d'un commentaire : absente du contrat RealWorld, qui ne prévoit que
  la création et la suppression.
- La pagination des commentaires : l'API les renvoie tous, et le contrat ne
  décrit aucun découpage.
- Le rendu du corps de l'article, couvert par [REQ-WEB-012](REQ-WEB-012.md).
