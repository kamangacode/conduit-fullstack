---
id: REQ-TEST-001
title: Mesurer par mutation ce que la couverture de lignes ne dit pas, et poser un plancher de non-régression
type: non-functional
domain: testing
status: implemented
priority: could
source: "plan outillage-craft item C8 (Phase 5 — Stryker sur le domaine) ; gate Phase 5 (« mutation score documenté ») ; rule 16 (convention anti-tautologie) ; rule 21 (calibrer un seuil avant de gater)"
acceptance_criteria:
  - id: AC-1
    given: "le domaine `apps/api/src/domain` et ses specs, tels que versionnés"
    when: "`pnpm --filter @repo/api mutation` s'exécute"
    then: "il produit un score de mutation chiffré et un rapport HTML — la mesure existe, elle n'est plus une intention"
  - id: AC-2
    given: "trois runs sur un code identique, qui donnent 73.19 %, 71.74 % puis 73.91 %"
    when: "on fixe le seuil bloquant"
    then: "il vaut 65, marge prise sur l'**amplitude observée** (≈ 2,2 points) et non sur un chiffre rond — un plancher calé sur la seule première mesure serait tombé au rouge sans qu'aucun test ne change"
  - id: AC-3
    given: "un seuil volontairement inatteignable (99 %) sur le même code"
    when: "la mutation s'exécute"
    then: "Stryker nomme le score et le seuil (« Final mutation score 71.74 under breaking threshold 99 ») et sort en **code 1** — le plancher mord, il n'est pas décoratif"
implementation:
  files:
    - apps/api/stryker.config.mjs
    - apps/api/package.json
    - .gitignore
  tests:
    - apps/api/src/domain/user/user.spec.ts
related:
  issues: []
  requirements:
    - REQ-ARCH-002
  adrs: []
---

# REQ-TEST-001 — Mesurer par mutation ce que la couverture de lignes ne dit pas

## Contexte

La rule 16 porte une convention anti-tautologie — « supprime mentalement le
guard testé ; si le test passe encore, il est tautologique » — et dit elle-même
qu'elle est **une convention de revue, pas un gate exécutable**. Le test de
mutation est précisément l'outil qui l'exécute : il supprime la ligne à notre
place, des centaines de fois, et compte les fois où aucun test ne s'en aperçoit.

La couverture de lignes ne répond pas à cette question. Un fichier peut afficher
100 % de lignes couvertes et 0 % de mutants tués : il suffit que les tests
*traversent* le code sans rien affirmer dessus. Ce dépôt en a un exemple net,
mesuré ci-dessous.

Le périmètre est le **domaine seul**. C'est un choix, pas une limite technique :
le domaine est du TypeScript pur, testé sans mock, et c'est la couche où un test
creux coûte le plus cher — une règle métier que rien ne tient se découvre en
production. Muter les couches à doublures ou à vraie base produirait surtout des
survivants dus au harnais, c'est-à-dire du bruit.

## Mesure de référence — 2026-08-11

Premier run réel, sur 8 fichiers et 138 mutants, en 3 min 34 s.

**Le score n'est pas déterministe** : trois runs sur le même code ont donné
**73.19 %**, **71.74 %** et **73.91 %**, soit environ 2,2 points d'amplitude. La
cause est le sort des mutants qui tombent en *timeout* plutôt qu'en *tué* — six
sur `slug.ts` au premier run — et un timeout dépend de la charge de la machine,
pas du code. C'est ce qui a fait descendre le plancher de 70 à 65 : calé sur la
seule première mesure, il aurait laissé 1,74 point de marge et serait passé au
rouge sans qu'aucun test ne change. Un gate qui rougit sans cause se désactive au
troisième faux positif.

Le tableau ci-dessous vient du premier run ; les écarts entre runs portent sur
les timeouts, pas sur la répartition par fichier.

| Fichier | Score | Survivants |
|---|---|---|
| **Total** | **73.19 %** | 32 (+ 6 timeouts, 5 sans couverture) |
| `article/article.ts` | 96.43 % | 0 |
| `article/slug.ts` | 96.43 % | 0 |
| `comment/comment.ts` | 85.00 % | 0 |
| `shared/errors/domain.error.ts` | 100 % | 0 |
| `user/user.ts` | 62.79 % | 16 |
| `user/user.errors.ts` | 20.00 % | 8 |
| `comment/comment.errors.ts` | 0.00 % | 4 |
| `article/article.errors.ts` | 0.00 % | 4 |

## Ce que les survivants disent

Deux familles, et la seconde est la plus instructive.

**Les classes d'erreur (0 % à 20 %).** Leurs mutants survivants sont des
`StringLiteral` : le message peut être remplacé par n'importe quoi, aucun test ne
s'en aperçoit. Les specs vérifient le **type** de l'erreur levée, jamais son
message. Ce n'est pas nécessairement un défaut — le contrat externe expose des
codes d'erreur, pas ces messages ([`packages/shared`](../../../../packages/shared)
porte les messages du contrat, eux testés). Mais c'était une hypothèse implicite,
et elle est désormais chiffrée.

**`user.ts` à 62.79 %, seize survivants.** Celui-là est un vrai signal : c'est
l'entité la plus riche en règles (normalisation, comparaison, mise à jour
partielle), et un mutant sur trois y passe inaperçu. Les opérateurs survivants
sont surtout des `ConditionalExpression` et des `LogicalOperator`, c'est-à-dire
des **branches** dont aucun test ne distingue les deux issues.

C'est exactement le mode de panne que la rule 16 décrit sous « la donnée de test
peut-elle rendre visible la transformation que je crains ? », et que le dépôt a
déjà rencontré en C3 : une fixture déjà normalisée ne peut pas révéler une
normalisation. Le score met un chiffre sur ce que la revue avait attrapé une fois
par chance.

## Règles

- **Le seuil est un plancher de non-régression, pas une cible.** `break: 65`
  dérive des deux mesures (73.19 % et 71.74 %), avec une marge prise sur
  l'**amplitude observée** plutôt que sur un chiffre rond.
- **Il se relève quand les survivants sont traités.** Un plancher qu'on ne
  remonte jamais devient un plafond.
- **La mutation ne tourne pas en pre-push ni en gate de CI.** 3 min 34 s pour
  huit fichiers, et le gate Phase 5 demande un score *documenté*. La faire
  bloquer chaque push la ferait désactiver ; c'est l'étape 3 de la rule 21.

## Hors périmètre

- **Les couches `application`, `infrastructure`, `interface`** : voir Contexte.
- **`fast-check` (property-based)**, second volet de l'item C8, traité séparément.
- **Le traitement des survivants** : cette exigence les mesure et les nomme. Les
  tuer est un travail distinct, qui commencera par `user.ts`.

## Couverture

AC-1 et AC-2 sont établis par les deux mesures ci-dessus, reproductibles par
`pnpm --filter @repo/api mutation`.

**AC-3 a été éprouvé, pas supposé** : le seuil a été porté à 99 sur le même code,
et le run a rendu « Final mutation score 71.74 under breaking threshold 99,
setting exit code to 1 (failure) », code de sortie **1**. La vérification a
d'ailleurs failli être faussée : une première tentative passait le seuil en
option de ligne de commande (`--thresholds.break 99`), et le code 1 obtenu
venait d'un `error: unknown option` — un échec pour la mauvaise raison, qui
aurait « prouvé » le contraire de ce qu'on croyait mesurer. Seule la lecture du
message a fait la différence.

`implementation.tests` désigne `user.spec.ts` : c'est la spec que la mesure
désigne comme la plus faible du domaine, donc le fichier que la prochaine
itération devra faire bouger. Le lien n'est pas décoratif — il rattache le
chiffre à l'endroit où il se corrige.
