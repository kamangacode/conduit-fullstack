# Architecture Decision Records

Les décisions techniques structurantes de `conduit-fullstack` sont versionnées
ici, à côté du code qu'elles gouvernent. Un ADR répond à une question que le
code seul ne documente pas : **pourquoi ce choix, contre quelles alternatives**.

**Quand créer un ADR** : voir [`.claude/rules/03-commits-review.md`](../../.claude/rules/03-commits-review.md)
(section « Décisions architecturales »). Cette page ne redécrit pas cette règle —
elle porte la mécanique : gabarit, numérotation, statuts, vérification.

## Index

| N° | Décision | Statut | Date |
|---|---|---|---|
| [001](001-topologie-monorepo-modele-partage.md) | Topologie monorepo et partage du modèle | Accepted | 2026-08-04 |
| [002](002-modele-donnees-prisma.md) | Modèle de données Conduit (Prisma / PostgreSQL) | Accepted (amendé par 004) | 2026-08-04 |
| [003](003-mises-a-jour-dependances-dependabot.md) | Mises à jour de dépendances : Dependabot | Accepted | 2026-08-04 |
| [004](004-persistance-alignee-sur-le-contrat.md) | Persistance alignée sur le contrat (id de commentaire, bio nullable) | Accepted | 2026-08-04 |
| [005](005-matrice-de-tracabilite-generee.md) | Matrice de traçabilité : artefact généré, non versionné | Accepted | 2026-08-05 |
| [006](006-couverture-sans-service-externe.md) | Couverture de tests : artefact de CI, sans service externe | Accepted | 2026-08-05 |
| [007](007-authentification-argon2id-jose.md) | Authentification : argon2id et jose derrière des ports du domaine | Accepted | 2026-08-05 |
| [008](008-permission-manquante-403.md) | Permission manquante : 403 conforme au contrat, plutôt que 404 | Accepted | 2026-08-05 |

## Écrire un ADR

1. Prendre le **prochain numéro libre** : `ls docs/adr/ | sort | tail -1`. Un
   numéro n'est jamais réutilisé, même si l'ADR finit `Deprecated` — un lien
   externe qui pointe vers `003` doit toujours désigner la même décision.
2. Copier [`000-template.md`](000-template.md) vers `NNN-slug.md`
   (slug kebab-case, ASCII, descriptif).
3. Remplir les cinq sections obligatoires, retirer les commentaires du gabarit.
4. Ajouter la ligne correspondante dans l'index ci-dessus.
5. Vérifier : `pnpm adr:check`.

## Statuts

| Statut | Sens |
|---|---|
| `Proposed` | Décision écrite, pas encore actée. Peut encore changer. |
| `Accepted` | Décision en vigueur. Le code doit s'y conformer. |
| `Superseded` | Remplacée par un ADR ultérieur, qui doit être lié depuis le `Status`. |
| `Deprecated` | Plus en vigueur, sans remplaçant (le besoin a disparu). |

**Un ADR accepté ne se réécrit pas.** Quand la réalité tranche contre lui, on
l'**amende** : le nouvel ADR indique dans son `Status` ce qu'il amende, et
l'ancien reçoit un pointeur vers l'amendement. Le désaccord entre les deux dates
est l'information la plus utile du dossier — l'effacer, c'est perdre la trace du
moment où on a appris quelque chose. L'ADR [002](002-modele-donnees-prisma.md)
amendé par [004](004-persistance-alignee-sur-le-contrat.md) en est l'exemple
vivant dans ce dépôt.

## Vérification

`pnpm adr:check` ([`scripts/check-adr-index.sh`](../../scripts/check-adr-index.sh))
échoue si :

- un fichier ADR ne suit pas `NNN-slug.md` en kebab-case ;
- deux ADR portent le même numéro (collision silencieuse sinon) ;
- un titre `H1` ne suit pas `# ADR NNN — …` ;
- une des cinq sections obligatoires, ou une des trois sous-sections de
  `Consequences`, manque ;
- le statut déclaré n'est pas dans le tableau ci-dessus ;
- un ADR n'est pas listé dans l'index, ou l'index pointe vers un fichier absent.

Le contrôle tourne en pre-commit (sur les fichiers `docs/adr/**`) et dans le job
`quality` de la CI : un index à jour ne dépend pas de la vigilance du rédacteur.
