# Architecture Decision Records

Les décisions techniques structurantes de `conduit-fullstack` sont versionnées
ici, à côté du code qu'elles gouvernent. Un ADR répond à une question que le
code seul ne documente pas : **pourquoi ce choix, contre quelles alternatives**.

**Quand créer un ADR** : voir `.claude/rules/03-commits-review.md` (cadre de
développement local, non publié — voir la note en bas de page)
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
| [009](009-conflit-unicite-409.md) | Violation d'unicité : 409 Conflict plutôt que 422 | Accepted | 2026-08-05 |
| [010](010-unicite-du-slug-article.md) | Unicité du slug d'article : suffixe incrémental résolu par la contrainte | Accepted | 2026-08-05 |
| [011](011-lecture-des-listes-port-dedie.md) | Lecture des listes d'articles : port de lecture dédié, séparé de l'écriture | Accepted | 2026-08-05 |
| [012](012-rendu-hybride-et-session-client.md) | Rendu hybride et session portée par le client | Accepted | 2026-08-05 |
| [013](013-rendu-markdown-sur-par-construction.md) | Rendu Markdown sûr par construction, sans assainissement à appeler | Accepted | 2026-08-05 |
| [014](014-conformite-au-contrat-de-selecteurs-e2e.md) | Conformité au contrat de sélecteurs E2E : jeton seul persisté, session réhydratée par l'API | Accepted | 2026-08-05 |
| [015](015-prefetch-serveur-et-hydratation-des-listes.md) | Listes publiques : préchargement serveur et hydratation du cache client | Accepted | 2026-08-05 |
| [016](016-suite-de-conformite-vendoree.md) | Suite de conformité RealWorld vendorée, avec contrôle de dérive | Accepted | 2026-08-05 |
| [017](017-messages-du-contrat-dans-shared.md) | Les messages d'erreur du contrat vivent dans `packages/shared` | Accepted (amende 004) | 2026-08-05 |
| [018](018-conformite-e2e-suite-officielle-vendoree.md) | Conformité e2e du front : suite Playwright officielle vendorée, en rapport avant d'être un gate | Accepted (étend 016) | 2026-08-06 |
| [019](019-alignement-de-l-hote-d-api-pour-la-suite-e2e.md) | Aligner l'hôte d'API du navigateur sur celui que la suite e2e intercepte, et le résoudre vers l'API du run | Accepted (précise 018) | 2026-08-06 |
| [020](020-chargement-client-des-pages-de-contenu.md) | Charger l'article, le profil et l'éditeur depuis le navigateur, et non plus au rendu serveur | Accepted (amende 012 et 015) | 2026-08-06 |
| [021](021-chemin-de-creation-d-article-aligne-sur-le-contrat-e2e.md) | Aligner le chemin de création d'article sur la forme que la suite e2e intercepte | Accepted (précise 018, prolonge 019) | 2026-08-06 |
| [022](022-flux-demande-et-flux-resolu.md) | Distinguer le flux demandé du flux résolu, et faire primer la suite vendorée sur les exigences | Accepted (amende 012, précise 018) | 2026-08-07 |
| [023](023-pagination-formulaire-get-et-taille-de-page.md) | Pagination : contrôles en formulaire GET, et taille de page choisie par le front | Accepted (précise 014) | 2026-08-07 |
| [024](024-verrou-sql-brut-plugin-biome.md) | Verrou SQL brut : plugin GritQL Biome, plutôt qu'un second linter | Accepted | 2026-08-07 |
| [025](025-validation-env-avant-chargement-du-graphe.md) | Valider l'environnement avant de charger le graphe applicatif | Accepted | 2026-08-08 |

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

## Note sur `.claude/rules/`

Plusieurs ADR renvoient à des fichiers de `.claude/rules/`. Ce dossier porte le
cadre de développement **local** et n'est pas publié (`.gitignore`) : les
références sont donc données en clair plutôt qu'en lien, pour ne pas produire de
404 depuis le dépôt public.

Ce que ces règles imposent et qui engage le code est repris ici et dans les ADR
concernés — un lecteur externe doit pouvoir reconstruire la décision sans avoir
accès au cadre.
