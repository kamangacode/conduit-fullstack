---
paths:
  - "docs/requirements/**"
  - "apps/api/src/**/*.spec.ts"
  - "apps/web/src/**/*.spec.tsx"
---

# Requirements docs-as-code

Les exigences sont versionnées comme du code dans `docs/requirements/`, avec frontmatter Zod validé et matrice de traçabilité générée.

## Quand créer ou mettre à jour un REQ

- **Nouveau comportement** fonctionnel ou non-fonctionnel qui n'est couvert par aucun REQ existant : créer `docs/requirements/{functional|non-functional}/{domain}/REQ-{DOMAIN}-{NNN}.md` depuis `docs/requirements/_template.md`.
- **Comportement existant étendu** : mettre à jour le REQ (ajouter un critère d'acceptation, bumper le `status`), rattacher l'issue dans `related.issues`.
- **ID jamais réutilisé**, même en `deprecated`. Un domaine = un préfixe mappé sur les modules (`REQ-ARTICLE-004`, `REQ-NFR-013`).

## Frontmatter Zod (source de vérité)

Schéma dans `docs/requirements/_scripts/schema.ts`. Points d'attention :
- `id` matche `/^REQ-[A-Z]+-\d{3}$/`.
- `status` : `draft | proposed | approved | implemented | deprecated`. `priority` MoSCoW : `must | should | could | wont`.
- `acceptance_criteria` : au moins 1, chacun `given` / `when` / `then` (testable, pas vague).
- `superRefine` : si `status: implemented`, alors `implementation.files` **et** `implementation.tests` sont obligatoires et non vides (un fichier référencé inexistant fait échouer la validation).

## Toolchain

```bash
pnpm requirements:validate    # Zod + intégrité des liens. Bloquant (pre-commit + job CI).
pnpm requirements:matrix      # génère _generated/traceability-matrix.md + orphans.md
pnpm requirements:coverage    # couverture AC-level.
```

- Pre-commit `requirements-validate` (glob `docs/requirements/**`) et job CI `Validate requirements` : **bloquants**.
- Job CI `requirements-coverage` : commite `traceability-matrix.md` / `orphans.md` reviewables en PR.

## Convention de couverture AC-level

Un test prouve un critère précis via le **nommage** :
- `describe` racine préfixé par l'ID du REQ : `describe('REQ-ARTICLE-001 ...')`.
- `it()` préfixé par le critère : `it('AC-1: ...')`.

```ts
describe('REQ-ARTICLE-001 favorite an article', () => {
  it('AC-1: incrémente favoritesCount et rend l\'article visible dans le feed favoris', () => { /* ... */ })
  it('AC-2: rejette un favori en double (idempotence)', () => { /* ... */ })
})

describe('REQ-COMMENT-002 delete a comment', () => {
  it('AC-1: refuse la suppression si le user courant n\'est pas l\'auteur', () => { /* ... */ })
})

describe('REQ-PROFILE-003 follow a user', () => {
  it('AC-1: ajoute l\'utilisateur suivi au feed personnalisé', () => { /* ... */ })
})
```

Distinguer "le REQ a un test" de "tous ses critères sont vérifiés par des tests qui passent".

## Convention anti-tautologie

Voir [16-tests-coverage.md](16-tests-coverage.md) section "Tests comme preuves (anti-tautologie)" : c'est une **convention de revue**, pas un gate exécutable.
