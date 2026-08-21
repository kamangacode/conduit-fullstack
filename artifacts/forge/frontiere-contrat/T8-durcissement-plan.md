---
ref: T8
titre: Passer les règles de frontière en error et étendre à web et shared
tier: F-lite
vague: 3
depend_de: [T4, T5, T6, T7]
statut: planifie
---

# T8 — Fermer la porte

## 1. Problème

À l'issue de T7, les deux compteurs posés en T2 sont à zéro : plus aucun fichier de `domain/` ni
de `application/` n'importe `@repo/shared`. Rien n'empêche pourtant la dérive de recommencer.
Trois choses restent à faire, et elles n'avaient pas de sens avant :

1. Les règles `domain-owns-its-model` et `application-owns-its-io` sont en `warn`. Un `warn` ne
   bloque ni un push ni une PR. Poser la règle en `error` avant que le compteur soit à zéro aurait
   bloqué tous les lots intermédiaires ; maintenant c'est possible.
2. `infrastructure/` n'est couvert par aucune des deux règles. Après T4, T5 et T7, les adapters
   Prisma n'importent plus le contrat. Il faut le verrouiller aussi, sinon la prochaine
   projection repartira par là.
3. `scripts/verify-type-boundary.sh` ne prouve toujours que la moitié de la thèse. Il vérifie que
   renommer un champ du contrat casse les consommateurs. Il ne vérifie pas que ça **ne casse pas**
   le domaine, qui est désormais la propriété intéressante.

Reste le trou d'origine, jamais comblé : le script `depcruise` est `cd apps/api && depcruise src`.
**`apps/web` et `packages/shared` n'ont jamais été analysés.**

## 2. Périmètre

| Fichier | Action |
|---|---|
| `.dependency-cruiser.cjs` | `warn` vers `error`, périmètre étendu à `infrastructure/` |
| `package.json` | script `depcruise` couvrant les trois workspaces |
| `scripts/verify-type-boundary.sh` | assertion négative ajoutée |
| `docs/requirements/non-functional/architecture/REQ-ARCH-001.md` | AC-3 ajouté (assertion négative) |

## 3. Décisions

**Une seule règle en sortie, pas trois.** Les deux règles de T2 avaient un rôle de comptage : elles
devaient descendre séparément parce que des lots différents les faisaient descendre. Ce rôle est
terminé. Elles fusionnent en une règle qui dit exactement la cible de l'ADR 031 :

```js
{
  name: 'shared-stays-at-the-http-boundary',
  severity: 'error',
  comment:
    '@repo/shared est le contrat HTTP (enveloppes, DTOs, CONDUIT_ERROR_STATUS). ' +
    'Seul interface/ le consomme. domain/ possède son modèle, application/ possède ' +
    "l'entrée et la sortie de ses use cases, infrastructure/ ne connaît pas le fil. " +
    'Voir ADR 031 et docs/architecture/frontieres-hexagonales.md.',
  from: { path: '^src/(domain|application|infrastructure)/' },
  to: { path: '@repo/shared' },
}
```

**L'assertion négative est ce qui rend la thèse démontrable.** Le script casse un champ du contrat
et constate aujourd'hui que `apps/web` et `apps/api` échouent. Il doit désormais constater en plus
qu'**aucune erreur de compilation ne cite `src/domain/` ni `src/application/`**. C'est la
formulation exécutable de l'ADR 031, et c'est une propriété plus intéressante que celle d'origine :
une thèse qui casse partout ne prouve rien.

**`apps/web` et `packages/shared` entrent dans l'analyse, mais sans règle de couche.** Le front n'a
pas d'architecture hexagonale à garder ; ce qu'on veut de lui, c'est `no-circular` et `no-orphans`.
Inventer des couches pour `apps/web` dans ce lot serait un sujet séparé, non instruit, et
probablement faux. Le périmètre s'étend, les règles restent celles qui s'appliquent.

**Risque assumé :** l'extension peut faire apparaître des cycles ou des orphelins préexistants
dans `apps/web`. S'il y en a, ils sont **nommés en `warn`** comme en T2 et sortis du périmètre de
ce lot, avec une ligne de suivi. Les corriger ici mélangerait deux sujets.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `pnpm depcruise` sort en 0 et analyse les trois workspaces. Le nombre de modules
  cruisés est strictement supérieur à 109.
- **AC-2** : ajouter `import type { Article } from '@repo/shared'` dans n'importe quel fichier de
  `domain/`, `application/` ou `infrastructure/` fait sortir `pnpm depcruise` en échec. Vérifié
  activement, puis annulé.
- **AC-3** : `bash scripts/verify-type-boundary.sh` sort en 0, et son assertion négative échoue
  si on rétablit un import de `@repo/shared` dans `domain/`. Vérifié activement.
- **AC-4** : REQ-ARCH-001 porte l'assertion négative dans ses critères, et
  `pnpm requirements:validate` sort en 0.
- **AC-5** : le hook pre-push complet passe (`lefthook.yml` : biome, knip, depcruise, typecheck,
  test).
- **AC-6** : `pnpm conformance` et `pnpm conformance:e2e` verts.

## 5. Slices

1. Fusionner les deux règles en `shared-stays-at-the-http-boundary`, sévérité `error`.
2. Étendre le script `depcruise` aux trois workspaces, relever et traiter les découvertes.
3. Ajouter l'assertion négative au script de frontière, et l'AC correspondant à REQ-ARCH-001.
4. Vérification active des AC-2 et AC-3 (casser, constater, annuler).

## 6. Hors-scope

- Corriger les cycles ou orphelins que l'extension révélerait dans `apps/web`.
- Inventer une architecture en couches pour le front.
- L'ADR 004, dont le raisonnement porte la même inversion mais dont les décisions concrètes
  tiennent sur leurs propres mérites.
