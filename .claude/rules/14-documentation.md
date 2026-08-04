---
paths:
  - "docs/**"
  - "**/*.md"
---

# Documentation — maintenue comme du code

> La documentation vit dans `docs/` et est traitée avec la même rigueur que le code.

## Structure `docs/`

```
docs/
├── architecture/          # Architecture technique
│   ├── hexagonal.md       # Architecture hexagonale apps/api
│   └── adr/                # Architecture Decision Records
├── guides/                # How-to guides (ajout feature, déploiement, auth…)
└── standards/             # Standards de code (frontend, backend, tests)
```

## Quand mettre à jour la documentation

| Déclencheur | Action doc requise |
|---|---|
| Nouvelle feature (Tier F-full) | Mettre à jour les docs **avant** la PR — guides si nouveau pattern, standards si nouvelle convention |
| Changement d'architecture | Mettre à jour `docs/architecture/` + créer un ADR si décision significative |
| Nouveau pattern ou convention de code | Mettre à jour `docs/standards/` |
| Changement critique (auth, deploy, env) | Mettre à jour `CLAUDE.md` section concernée |
| Nouvel outil ou intégration | Ajouter un guide dans `docs/guides/` |
| Changement de modèle de données | Mettre à jour `docs/architecture/hexagonal.md` (ou le guide domaine concerné) + créer un ADR |
| Migration Prisma (`prisma migrate dev`) | Vérifier que la doc du schema (si elle existe) reflète l'état cible. `schema.prisma` reste la source de vérité pour l'état réel. |
| Toute PR | Vérifier : "La documentation est-elle à jour ?" |

## Règles d'écriture

- **Format :** Markdown (`.md`) dans `docs/`
- **Pas de H1** dans le contenu (le titre vient du premier `#` du fichier)
- **Liens internes** en chemins relatifs (`../guides/deployment.md`)
- Tout fichier ajouté à `docs/` doit avoir un titre clair en première ligne

## Quoi documenter où

| Contenu | Destination |
|---|---|
| Décision technique (choix lib, pattern) | `docs/architecture/adr/NNN-slug.md` |
| Architecture (couches, séparation, diagrammes) | `docs/architecture/` |
| Comment faire X (guide pas à pas) | `docs/guides/` |
| Convention de code (nommage, patterns, erreurs) | `docs/standards/` |

## Avant d'écrire du code — lire les standards

| Contexte | Lire |
|---|---|
| Frontend (React, Next.js) | `docs/standards/` (section apps/web) |
| Backend (NestJS, Prisma) | `docs/standards/` (section apps/api) + `docs/architecture/hexagonal.md` |
| Nouveau modèle de données | `docs/architecture/hexagonal.md` + ADR correspondant |
| Écriture de docs | Cette section |
