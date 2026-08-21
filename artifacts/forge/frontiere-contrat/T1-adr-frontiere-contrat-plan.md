---
ref: T1
titre: ADR 031 — le contrat partagé s'arrête à la frontière HTTP
tier: F-lite
vague: 0
depend_de: []
statut: planifie
---

# T1 — ADR 031 et alignement des exigences

## 1. Problème

Trois artefacts documentaires portent aujourd'hui la confusion qui a produit la dérive, et deux
d'entre eux **interdisent activement** de la corriger.

1. L'[ADR 001](../../../docs/adr/001-topologie-monorepo-modele-partage.md) déclare
   `packages/shared` « source de vérité unique du **modèle Conduit** ». Le mot « modèle » est
   l'origine de tout : il autorise le domaine à importer le contrat.
2. L'[ADR 011](../../../docs/adr/011-lecture-des-listes-port-dedie.md), lignes 70 à 73, affirme
   que le domaine reste pur et que `dependency-cruiser` le vérifie mécaniquement. C'est faux, et
   cette phrase a rendu la dérive invisible pendant trente ADR.
3. `REQ-ARCH-001` exige que **`apps/api` et `apps/web` échouent tous les deux** au renommage d'un
   champ du contrat, et `scripts/verify-type-boundary.sh` le vérifie en pre-push et en CI. C'est
   un test de non-régression **du couplage** : tel quel, il fait échouer le premier commit de T3.

Tant que ces trois artefacts sont en place, aucun lot de correction ne peut être vert.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `docs/adr/031-le-contrat-partage-s-arrete-a-la-frontiere-http.md` | créer |
| `docs/adr/README.md` | ajouter l'entrée d'index (contrôlé par `pnpm adr:check`) |
| `docs/adr/001-topologie-monorepo-modele-partage.md` | amender `Decision` et `Consequences` |
| `docs/adr/011-lecture-des-listes-port-dedie.md` | `Status` en `Superseded`, retirer la phrase fausse |
| `docs/requirements/non-functional/architecture/REQ-ARCH-001.md` | réécrire titre, AC-1, AC-2, contexte |
| `scripts/verify-type-boundary.sh` | cibler `interface/` et `apps/web`, en-tête reformulé |

## 3. Décisions

**La décision de l'ADR 031** tient en trois affirmations :

- `packages/shared` est un **Published Language**. Il porte le contrat HTTP et rien d'autre :
  enveloppes, DTOs d'entrée, messages, `CONDUIT_ERROR_STATUS`. Ses consommateurs légitimes sont
  `apps/web` et `apps/api/src/interface/`. Il ne franchit pas `interface/`.
- `apps/api/src/domain/` possède son modèle. Un type du domaine n'a pas à ressembler au fil.
- Le critère de placement d'un port change : non plus « un port vit dans `domain/` » mais **« un
  port vit là où vit ce qu'il protège »**. Les ports d'écriture manipulent des agrégats porteurs
  d'invariants et restent en `domain/*/ports/`. Les ports de lecture servent un cas d'usage
  d'affichage, ne portent aucune règle métier, et descendent en `application/*/ports/`.

**Sur l'ADR 011 :** `Superseded by ADR 031`, pas `Deprecated`. Sa décision de fond — séparer
lecture et écriture — est conservée. Seuls l'emplacement des ports de lecture et le type qu'ils
renvoient changent.

**Sur `verify-type-boundary.sh` :** l'assertion négative (« aucune erreur ne cite `src/domain/`
ni `src/application/` ») n'est **pas** ajoutée ici. Elle ne devient vraie qu'après T7. T1 se
contente de reformuler les assertions positives pour qu'elles visent `apps/web` et
`apps/api/src/interface/`, ce qui est vrai avant comme après le lot. T8 ajoute la négative.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `pnpm adr:check` sort en 0. L'ADR 031 porte les cinq sections `##` et les trois
  sous-sections `###` de `Consequences`, un titre `# ADR 031 — …`, un statut de la liste fermée,
  et il est listé dans `docs/adr/README.md`.
- **AC-2** : l'ADR 011 porte `Superseded` et ne contient plus aucune affirmation selon laquelle
  depcruise vérifie la pureté du domaine vis-à-vis de `@repo/shared`.
- **AC-3** : l'ADR 001 ne contient plus l'expression « source de vérité unique du modèle
  Conduit ». Il renvoie à l'ADR 031 pour la portée exacte du partage.
- **AC-4** : `bash scripts/verify-type-boundary.sh` sort en 0 sur le dépôt **non modifié par les
  lots suivants**, et son en-tête énonce la portée de l'ADR 031 ainsi que la moitié de propriété
  qu'il ne couvre pas encore.

  > **Correction du 2026-08-21, à l'implémentation.** Cet AC exigeait d'abord que les assertions
  > du script « citent `apps/web` et `apps/api/src/interface/` ». C'était faux : à cette date, un
  > renommage de `favoritesCount` fait échouer l'API dans `infrastructure/persistence/prisma-article.query.ts`,
  > pas dans `interface/`, puisque c'est l'adapter qui fabrique la projection du contrat. La
  > citation de `interface/` ne devient vraie qu'après T4. L'assertion de couche part donc en T8
  > avec l'assertion négative, et T1 se limite à aligner le vocabulaire et à documenter la portée.
  > Écrire une assertion connue pour être fausse serait reproduire exactement le défaut que l'ADR
  > 031 corrige.
- **AC-5** : `pnpm requirements:validate` sort en 0 (REQ-ARCH-001 reste valide après réécriture).
- **AC-6** : `pnpm lint` et `pnpm typecheck` sortent en 0.

## 5. Slices

1. Écrire l'ADR 031 et l'ajouter à l'index. Vérifier par `pnpm adr:check`.
2. Amender l'ADR 001 puis l'ADR 011.
3. Réécrire REQ-ARCH-001 (AC-1, AC-2, contexte, `implementation.files`).
4. Adapter `verify-type-boundary.sh` et l'exécuter.

## 6. Hors-scope

- Toute modification de code applicatif. T1 est un lot purement documentaire plus un script.
- L'assertion négative du script (T8).
- Les règles depcruise (T2).
- L'ADR 017, amendé par T3 puisque c'est T3 qui déplace les messages du contrat.
