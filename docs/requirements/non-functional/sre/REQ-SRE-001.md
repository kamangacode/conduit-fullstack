---
id: REQ-SRE-001
title: Séparer liveness et readiness, pour qu'une base indisponible ne fasse pas redémarrer l'application
type: non-functional
domain: sre
status: implemented
priority: should
source: "plan outillage-craft item C5 (Phase 5 — @nestjs/terminus, sondes readiness/liveness consommées par Railway) ; ADR 024 et REQ-SEC-002 (interdiction du SQL brut non paramétré)"
acceptance_criteria:
  - id: AC-1
    given: "une application démarrée, sans aucune base joignable"
    when: "on interroge `GET /health/live`"
    then: "elle répond 200 : la liveness dit « ce processus est vivant », question à laquelle une base ne répond pas"
  - id: AC-2
    given: "une base qui répond"
    when: "on interroge `GET /health/ready`"
    then: "elle répond 200 et nomme l'indicateur `database` en `up` — la readiness dit « je peux servir du trafic », ce qui suppose ses dépendances"
  - id: AC-3
    given: "une base qui ne répond pas"
    when: "on interroge `GET /health/ready`"
    then: "elle répond 503 et nomme `database` parmi les indicateurs en défaut, plutôt qu'un échec générique qui laisserait chercher"
  - id: AC-4
    given: "cette même base indisponible, au même instant"
    when: "on interroge les deux sondes"
    then: "`/health/live` répond 200 pendant que `/health/ready` répond 503 — c'est le seul test qui prouve que la liveness n'a pas été câblée sur la base par mégarde, et le défaut qu'il attrape provoque des redémarrages en boucle exactement quand la base est déjà en peine"
  - id: AC-5
    given: "les deux sondes"
    when: "on les interroge sous le préfixe `/api`"
    then: "elles répondent 404 : elles sont consommées par la plateforme d'hébergement, pas par un client de l'API, et les ranger sous le préfixe du contrat les ferait dépendre d'une convention métier"
implementation:
  files:
    - apps/api/src/interface/health/health.controller.ts
    - apps/api/src/interface/health/health.module.ts
    - apps/api/src/infrastructure/health/prisma.health-indicator.ts
  tests:
    - apps/api/test/health.controller.spec.ts
related:
  issues: []
  requirements:
    - REQ-SEC-002
  adrs: []
---

# REQ-SRE-001 — Séparer liveness et readiness

## Contexte

Une plateforme d'hébergement pose deux questions différentes à une application, et
leur donne deux conséquences opposées :

- **Liveness** — « ce processus est-il vivant ? » Une réponse négative fait
  **redémarrer** le conteneur.
- **Readiness** — « peut-il servir du trafic ? » Une réponse négative le **retire
  du routage**, sans le tuer.

Répondre à la première en interrogeant la base est le défaut classique de ce
dispositif, et il est vicieux parce qu'il ne se manifeste **que pendant un
incident** : la base a un hoquet, la liveness échoue, l'orchestrateur redémarre
l'application — qui redémarre sans base, échoue à nouveau, et repart en boucle.
Le redémarrage n'a jamais aidé (le processus allait bien), et il ajoute une panne
d'application à une panne de base, au pire moment.

D'où deux sondes distinctes plutôt qu'une seule paramétrée : la séparation est ce
qu'on veut, et la garder implicite reviendrait à espérer que personne ne branche
un jour la base sur la mauvaise.

## Règles

- **La liveness n'a aucune dépendance externe.** Si elle en gagnait une, elle
  cesserait de répondre à sa question et deviendrait une readiness déguisée, avec
  le pouvoir de tuer le processus.
- **La readiness porte les dépendances nécessaires pour servir.** Aujourd'hui : la
  base. Une dépendance ajoutée demain s'y range, jamais dans la liveness.
- **La sonde de base emploie `$queryRaw`, jamais `$queryRawUnsafe`.** Le
  `PrismaHealthIndicator` fourni par `@nestjs/terminus` exige un client exposant
  `$queryRawUnsafe` et l'appelle en interne. La requête est constante, donc sans
  surface d'injection, et le verrou GritQL du dépôt ne lit pas `node_modules` —
  l'usage passerait. Il n'est pas retenu pour autant : un dépôt qui interdit cette
  méthode ([ADR 024](../../../adr/024-verrou-sql-brut-plugin-biome.md),
  [REQ-SEC-002](../security/REQ-SEC-002.md)) et dont la sonde de santé l'appelle
  se contredit devant son lecteur. L'indicateur est donc écrit sur le point
  d'extension prévu par terminus (`HealthIndicatorService`), avec la forme
  paramétrée.
- **Les sondes restent hors du préfixe `/api`**, comme la sonde minimale qui les
  précédait.

## Hors périmètre

- **Le seuil de bascule de la plateforme** (nombre d'échecs avant retrait ou
  redémarrage) : c'est un réglage d'hébergement, hors du dépôt.
- **`GET /health`**, la sonde minimale de la Phase 0, conservée telle quelle : elle
  porte la version du modèle partagé et sert de témoin de résolution
  cross-workspace. Les nouvelles sondes s'ajoutent, elles ne la remplacent pas.
- **Les sondes du front** (`apps/web`) : Vercel n'a pas le même modèle
  d'exécution, et rien ne le demande aujourd'hui.
- **Les métriques et les traces**, qui relèvent de l'item C6.

## Couverture

Les cinq critères sont prouvés dans
[`apps/api/test/health.controller.spec.ts`](../../../../apps/api/test/health.controller.spec.ts),
qui monte l'application Nest réelle et l'interroge par HTTP (rule 16), avec un
indicateur de base doublé pour piloter la panne.

**AC-4 est le critère qui porte l'exigence.** AC-1 et AC-3 pris séparément
passeraient sur une implémentation où les deux sondes seraient câblées à
l'identique — il suffirait que la base soit disponible dans un test et absente
dans l'autre. Seule l'interrogation des **deux sondes dans le même état du monde**
montre qu'elles ne répondent pas à la même question. C'est aussi la formulation
qui survit à un refactoring : elle ne dit rien de la façon dont la séparation est
obtenue, seulement qu'elle tient.

Le sabotage correspondant a été joué : brancher l'indicateur de base sur la
liveness fait tomber AC-1 et AC-4, et laisse AC-2, AC-3 et AC-5 au vert — ce qui
mesure exactement ce que les autres critères ne voient pas.
