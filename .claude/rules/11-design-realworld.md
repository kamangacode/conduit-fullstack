---
paths:
  - "**/*.tsx"
  - "**/*.css"
---

# Design — Fidélité à la spec RealWorld

## Pas de charte maison

Ce repo n'a **pas** de design system propriétaire. `conduit-fullstack` est une implémentation de la spec [RealWorld](https://realworld-docs.netlify.app/) : le frontend doit rester un clone crédible de l'app Conduit de référence, markup et classes CSS compris.

## Règle fondamentale

> **Le HTML rendu par `apps/web` suit le markup et les classes CSS du template RealWorld Conduit.**

Concrètement :

- Les composants React reproduisent la structure DOM attendue par la spec (ex : `.home-page`, `.banner`, `.container`, `.feed-toggle`, `.article-preview`, `.article-meta`, `.navbar`, `.navbar-brand`, `.nav-link`, `.pagination`, `.tag-list`, `.tag-pill`, `.sidebar`, `.article-page`, `.comment-form`, `.comment-card`, `.settings-form`, `.auth-page`, `.error-messages`).
- Les classes viennent du CSS de référence RealWorld (basé sur Bootstrap 4 / Ionicons dans la version originale) — on ne les renomme pas, on ne les remplace pas par des classes utilitaires maison.
- Un nouveau composant qui rend une page ou une section déjà spécifiée par RealWorld **doit** produire un DOM équivalent à celui du template de référence avant d'ajouter la moindre variation stylistique.

## Ce qu'on ne fait pas

- Pas de design system maison (pas de tokens de marque, pas de charte couleur propre à `conduit-fullstack`).
- Pas de renommage de classes CSS RealWorld « pour que ce soit plus propre ».
- Pas de librairie de composants qui masque le markup attendu (le DOM doit rester lisible et comparable à la démo officielle).

## Écarts autorisés

Un écart au markup de référence est acceptable seulement s'il est nécessaire techniquement (accessibilité, hydratation React/Next.js, sémantique HTML5) — documenter l'écart en commentaire au-dessus du composant concerné.
