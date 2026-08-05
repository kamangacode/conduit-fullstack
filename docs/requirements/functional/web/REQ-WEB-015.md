---
id: REQ-WEB-015
title: Lister les articles publiés et favoris d'un profil
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7.3 (filtres `author` et `favorited`, règle R-3) et §5 (routes `/profile/:username`, `/profile/:username/favorites`) ; templates.md §Profile"
acceptance_criteria:
  - id: AC-1
    given: "la page d'un profil"
    when: "elle s'affiche"
    then: "les articles **publiés** par ce compte sont listés, et l'onglet « My Articles » est actif"
  - id: AC-2
    given: "la route des favoris d'un profil"
    when: "elle s'affiche"
    then: "les articles **favorisés** par ce compte sont listés, et l'onglet « Favorited Articles » est actif"
  - id: AC-3
    given: "les deux onglets"
    when: "ils sont rendus"
    then: "chacun mène à sa route, et un seul porte la marque d'activité"
  - id: AC-4
    given: "un profil dont on liste les articles"
    when: "la requête part vers l'API"
    then: "le filtre employé distingue « écrit par » de « favorisé par » — les confondre listerait les articles d'autrui"
  - id: AC-5
    given: "un profil sans aucun article dans l'onglet consulté"
    when: "la liste s'affiche"
    then: "le message d'absence est rendu, comme sur le flux d'accueil"
  - id: AC-6
    given: "un profil dont les articles dépassent une page"
    when: "la liste s'affiche"
    then: "la pagination apparaît et conserve l'onglet courant"
implementation:
  files:
    - apps/web/src/lib/feed-query.ts
    - apps/web/src/components/ArticlesToggle.tsx
    - apps/web/src/app/profile-page.tsx
    - "apps/web/src/app/profile/[username]/page.tsx"
    - "apps/web/src/app/profile/[username]/favorites/page.tsx"
  tests:
    - apps/web/src/lib/feed-query.spec.ts
    - apps/web/src/components/ArticlesToggle.spec.tsx
    - apps/web/src/app/profile-page.spec.tsx
related:
  issues: [6]
  requirements:
    - REQ-WEB-005
    - REQ-WEB-009
    - REQ-WEB-010
    - REQ-WEB-011
    - REQ-ARTICLE-002
  adrs:
    - "015"
---

# REQ-WEB-015 — Lister les articles publiés et favoris d'un profil

## Contexte

Les deux onglets du profil sont la **quatrième et cinquième** liste d'articles de
l'application, après le flux global, le flux personnel et la page d'un tag. Elles
ne diffèrent des précédentes que par le filtre envoyé à l'API : c'est donc une
exigence sur la **réutilisation**, autant que sur le comportement.

AC-4 fixe la confusion qui rend ces deux listes dangereuses. Les filtres `author`
et `favorited` prennent tous deux un **username**, et sont donc interchangeables
sans erreur de type — la seule chose qui les distingue est le nom du paramètre.
Les intervertir produirait une réponse parfaitement bien formée : la page « mes
articles » afficherait les articles que ce compte a favorisés, c'est-à-dire ceux
d'autres personnes. Rien ne planterait, et l'erreur ne se verrait qu'en lisant
attentivement le contenu.

AC-5 et AC-6 ne demandent pas de comportement neuf : ils exigent que ces listes
se comportent **exactement** comme celles de l'accueil. Les écrire comme critères
plutôt que les supposer est ce qui empêche une seconde implémentation de liste de
s'installer discrètement.

## Règles

- Les filtres viennent du contrat (`author`, `favorited`, règle R-3) et
  transitent par le client partagé ([REQ-WEB-008](REQ-WEB-008.md)).
- L'aperçu, la pagination et le message d'absence sont **ceux du flux**
  ([REQ-WEB-009](REQ-WEB-009.md) à [REQ-WEB-011](REQ-WEB-011.md)) : aucune
  variante locale.
- Le préchargement serveur suit l'[ADR 015](../../../adr/015-prefetch-serveur-et-hydratation-des-listes.md),
  comme toute liste publique.
- Markup `templates.md` §Profile : `.articles-toggle`, `.nav-pills`,
  `.nav-link active`.

## Hors périmètre

- L'en-tête du profil (avatar, bio, bouton de suivi), déjà couvert par
  [REQ-WEB-005](REQ-WEB-005.md).
- Un onglet « brouillons » ou tout autre filtre : le contrat n'en décrit que
  deux.
