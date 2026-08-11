# ADR 028 — CHANGELOG et release dérivés de `main` par release-please

## Status

Accepted — 2026-08-11. Item **D5** du plan d'outillage (Phase 6, « Conventional
commits + CHANGELOG automatisé ») et réponse à la décision ouverte n°1 du plan
(« CHANGELOG : semantic-release vs changesets »).

## Context

Le dépôt impose déjà des Conventional Commits (rule 03), et la rule 15 décrit un
flux de livraison sans push direct sur `main` : le nouveau travail atterrit sur
`staging`, `main` ne reçoit que des **promotions** explicites `staging → main` en
merge commit. Ce que le dépôt n'a pas encore, c'est l'outil qui **dérive** de cet
historique conventionnel une version semver, un `CHANGELOG.md` et un tag — la rule
15 la nomme d'ailleurs par avance « `release-please.yml` (ou équivalent) », place
laissée vide jusqu'ici.

Sans cet outil, la version reste figée (`package.json` à `0.0.0`), aucun
changelog n'est produit, et un article « livraison automatisée » du blog n'a aucun
fichier réel à montrer — ce qui, pour un dépôt vitrine (rule 18), est le vrai
coût.

La décision est aussi **transverse** : `conduit-fullstack` sert de banc d'essai à
côté de `crmcoaching`, qui a déjà tranché ce point. Un choix divergent obligerait
à maintenir deux mécaniques de release et à écrire deux fois l'article.

## Options Considered

| Option | Trade-off |
|---|---|
| **release-please (retenue)** | GitHub Action officielle Google. **Manifest-driven** : un `release-please-config.json` + un `.release-please-manifest.json` décrivent quoi versionner ; l'action ouvre une **release PR** cumulative qu'un humain merge pour publier. Le versioning naît de `main`, exactement là où la promotion pose l'historique conventionnel — la mécanique s'emboîte dans le flux `staging → main` sans l'altérer. C'est le choix déjà en vigueur sur `crmcoaching` : un seul mécanisme, un seul article. Coût : dépendance à une Action et à `GITHUB_TOKEN`, et une release PR de plus à relire. |
| semantic-release | Publie **au fil du merge**, sans PR de release intermédiaire. Écartée : le modèle « publie dès que ça touche `main` » suppose que chaque merge sur `main` est une release, alors qu'ici `main` reçoit des **promotions** groupées ; on veut une porte humaine sur la version et le changelog, pas une publication réflexe. Configuration par plugins plus opaque à montrer dans un article. |
| changesets | Chaque PR déclare son intention de bump dans un fichier `.changeset/`. Excellent pour un monorepo **publiant plusieurs paquets**. Écarté : ici un seul artefact est versionné (la racine ; `api`/`web`/`shared` sont `private`), donc le fichier de changeset par PR est une cérémonie manuelle sans le bénéfice multi-paquets — et il repose sur la vigilance du contributeur là où release-please dérive tout des commits déjà exigés. |
| Ne rien faire (tag manuel) | Zéro dépendance. Écarté : versionner et rédiger un changelog à la main est précisément la tâche répétitive et oubliable que le reste de l'outillage du dépôt supprime ; incohérent avec `crmcoaching`. |

## Decision

Installer **release-please** en mode manifest, calqué sur `crmcoaching`, en
**racine seule** :

- `.github/workflows/release-please.yml` — déclenché sur `push` sur `main`,
  Action épinglée par SHA (`googleapis/release-please-action@45996ed…`, v5.0.0),
  permissions minimales `contents: write` + `pull-requests: write`,
  `token: GITHUB_TOKEN`.
- `release-please-config.json` — `release-type: node`, un seul paquet `.`,
  `component`/`package-name` = `conduit-fullstack`, `include-component-in-tag:
  false` (tags de la forme `vX.Y.Z`, sans préfixe de composant).
- `.release-please-manifest.json` — `{ ".": "0.0.0" }`, aligné sur la version
  actuelle de `package.json`.

Seul l'artefact **racine** est versionné : les workspaces `@repo/api`,
`@repo/web`, `@repo/shared` sont `private` et hors périmètre. La release
`0.x` est assumée tant que l'app n'a pas atteint son premier jalon stable ; la
**version du premier tag reste une décision humaine**, prise en relisant la
première release PR (via `Release-As:` dans un commit, ou en mergeant la PR
proposée). L'action ne publie jamais seule : elle prépare, l'humain merge.

La contrainte de la rule 15 est reconduite : la PR de promotion `staging → main`
se merge en **merge commit, jamais en squash** — un squash aplatirait les commits
conventionnels et release-please **sauterait la release** (pas de bump). Ne pas
poser le label `reviewed` sur cette PR de promotion si `auto-merge.yml` la
squasherait.

## Consequences

### Positive

- Version, `CHANGELOG.md` et tag dérivés automatiquement de l'historique
  conventionnel déjà imposé — plus de version figée ni de changelog à rédiger.
- Cohérence totale avec `crmcoaching` : une seule mécanique de release à
  comprendre, à maintenir et à documenter (un seul article D5).
- Porte humaine préservée : la release PR cumulative s'insère dans le flux
  `staging → main` sans le contourner, et rien n'est publié sans un merge humain.
- Action épinglée par SHA : la chaîne de release ne dérive pas sous un retag amont
  (garde-fou supply-chain, exemplaire pour le dépôt vitrine).

### Negative

- Dépendance à une GitHub Action tierce et à `GITHUB_TOKEN` ; une release de plus
  à relire à chaque cycle de promotion.
- La **première** release PR agrège tout l'historique conventionnel présent sur
  `main` au moment où l'outil est introduit — changelog initial volumineux, à
  relire (voire à borner via `Release-As`/`bootstrap-sha`) au premier passage.
- Le mode racine seule ne versionne pas les paquets individuellement ; si un
  paquet devait un jour être publié seul, la config devrait évoluer vers un
  plan par paquet.

### Neutral

- `release-type: node` fait évoluer la version de la racine `package.json`, qui
  reste `private` : le bump est une donnée de release, pas une publication npm.
- La bascule vers un tag `1.0.0` n'est pas décidée ici ; elle relèvera d'un choix
  produit, tracé le moment venu.
