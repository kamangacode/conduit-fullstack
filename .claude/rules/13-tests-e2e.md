---
paths:
  - "**/*.spec.ts"
  - "**/*.e2e.ts"
  - "**/*.test.ts"
  - "packages/playwright-config/**"
---

# Tests E2E — Playwright + Page Object Model

Les tests E2E utilisent **Playwright** avec le pattern **Page Object Model**. La config partagée est dans `packages/playwright-config/`.

## Quand écrire un test E2E

| Changement | Test E2E ? |
|---|---|
| Nouveau formulaire de création/édition d'article | Oui — soumission + article visible sur le feed |
| Auth (inscription, connexion, déconnexion) | Oui — parcours complet, redirection, persistance du token |
| Follow / unfollow un auteur | Oui — état du bouton avant/après, effet sur le feed "Your Feed" |
| Favorite / unfavorite un article | Oui — compteur de favoris, état du bouton |
| Ajout/suppression d'un commentaire | Oui — apparition/disparition dans la liste |
| Nouvel endpoint API sans UI | Non — test d'intégration Vitest suffit |
| Bug fix | Oui si reproductible en E2E, sinon test unitaire |
| Refactoring sans changement de comportement | Non |

## Commandes

```bash
pnpm test:e2e                       # Lancer tous les tests E2E
pnpm test:e2e:ui                    # Mode UI Playwright (debug)
```

## Patterns de fail récurrents

À compléter au fil des incidents E2E — chaque fail non trivial diagnostiqué doit laisser une trace ici (symptôme, cause racine, règle à suivre) pour éviter la régression.
