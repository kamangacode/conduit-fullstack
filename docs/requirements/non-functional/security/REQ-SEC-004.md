---
id: REQ-SEC-004
title: Refuser de démarrer sans configuration valide, y compris quand un fichier .env pourrait la fournir
type: non-functional
domain: security
status: implemented
priority: must
source: "plan outillage-craft item B1 (validation d'env Zod + fail-fast, remonté en Phase R) ; rule 19 (validation d'env au boot) ; ADR 025 ; PRD RGPD REQ-PRIV-008 proposé"
acceptance_criteria:
  - id: AC-1
    given: "une variable requise absente (`DATABASE_URL`, `JWT_SECRET`) ou malformée (secret trop court, URL non PostgreSQL, port non numérique)"
    when: "le point d'entrée réel de l'API est démarré"
    then: "le process sort en erreur, sur le message de configuration et en nommant la variable fautive — les trois faits conjoints, sans quoi un arrêt dû à un port occupé compterait pour un fail-fast"
  - id: AC-2
    given: "une valeur refusée par le schéma"
    when: "le message d'erreur est écrit au démarrage"
    then: "la valeur n'y apparaît pas — ces lignes partent dans les logs de la plateforme d'hébergement, que bien plus de gens peuvent lire que la variable elle-même"
  - id: AC-3
    given: "une configuration complète et valide"
    when: "le point d'entrée est démarré"
    then: "la porte de configuration est franchie et l'amorçage se poursuit — sans ce contrôle positif, un garde-fou qui refuse tout satisferait tous les autres critères"
  - id: AC-4
    given: "une configuration invalide, et un fichier `.env` présent sur le disque qui définirait la variable manquante"
    when: "le point d'entrée est démarré"
    then: "le démarrage est refusé **et aucun module applicatif n'est chargé** — critère écrit en négatif pour ne dépendre d'aucun effet de bord particulier : on n'exige pas de les connaître, on exige qu'aucun n'ait la possibilité de se produire"
  - id: AC-5
    given: "un point d'entrée reproduisant l'ordre d'exécution antérieur — graphe applicatif importé statiquement, validation ensuite"
    when: "il est soumis au même harnais dans les conditions d'AC-4"
    then: "la sonde de chargement le voit charger le graphe avant de valider, ce qui prouve qu'une sonde muette en AC-4 est un fait et non une panne de sonde"
implementation:
  files:
    - apps/api/src/main.ts
    - apps/api/src/config/env.ts
    - apps/api/package.json
    - .dockerignore
    - turbo.json
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-env-fail-fast.sh
    - apps/api/src/config/env.spec.ts
related:
  issues: []
  requirements:
    - REQ-SEC-001
    - REQ-SEC-002
  adrs: ["025"]
---

# REQ-SEC-004 — Refuser de démarrer sans configuration valide, y compris quand un fichier .env pourrait la fournir

## Contexte

Une variable d'environnement manquante ne produit pas une panne franche : elle
produit une dégradation différée. Une `DATABASE_URL` absente donne une 500 à la
troisième requête, un `JWT_SECRET` absent donne des jetons signés avec
`undefined`. Dans les deux cas le symptôme apparaît loin de la cause, et souvent
chez l'utilisateur plutôt que chez l'opérateur. C'est pourquoi la rule 19 exige
un arrêt au démarrage.

Cette exigence est écrite **après** l'implémentation de l'item B1, et c'est
volontairement inhabituel dans ce dépôt. B1 avait livré le schéma Zod, le
fail-fast et 12 tests unitaires ; ce qui manquait n'était pas le mécanisme mais
sa **preuve exécutable**. Le 2026-08-08, la vérification du gate de la Phase 3 a
montré l'API démarrer entièrement sans `DATABASE_URL` ni `JWT_SECRET` — non pas
parce que la validation était fausse, mais parce qu'elle s'exécutait après le
chargement du graphe applicatif, lequel charge `.env` par un effet de bord de
`@prisma/client` ([ADR 025](../../../adr/025-validation-env-avant-chargement-du-graphe.md)).

Le REQ existe donc pour la raison qui rend un REQ utile : la propriété était
déclarée tenue, elle ne l'était pas, et rien dans le dépôt n'était en mesure de
le dire.

## Règles

- La propriété porte sur le **process réel**, pas sur la fonction de validation.
  `parseEnv` refusait correctement pendant toute la durée du défaut ; le tester
  seul revenait à tester une pièce dont l'assemblage était en cause.
- L'ordre d'exécution fait partie du contrat : la validation précède le
  chargement du graphe applicatif. Ce n'est pas une préférence de style, c'est ce
  qui distingue un fail-fast d'un fail-fast conditionné à l'absence d'un fichier.
- Le message d'erreur **nomme** les variables fautives et **énumère tous** les
  problèmes, sans jamais réafficher la moindre valeur reçue.

## Hors périmètre

- La joignabilité de la base. La preuve s'arrête à « la configuration est
  acceptée » : le démarrage complet suppose une PostgreSQL, que le job `Quality`
  n'a pas, et cette part est déjà couverte par les tests d'intégration.
- Les variables optionnelles à valeur par défaut (`PORT`, `JWT_EXPIRES_IN`,
  `CORS_ORIGIN`, `NODE_ENV`). Leur absence n'a aucune conséquence de sécurité —
  une origine CORS trop restrictive bloque, elle ne divulgue rien.
- La provenance des secrets (gestionnaire de secrets, rotation). Le PRD de
  conformité RGPD la traite ; ici on garantit seulement que leur absence
  s'entend.

## Couverture

Les cinq critères sont prouvés par
[`scripts/verify-env-fail-fast.sh`](../../../../scripts/verify-env-fail-fast.sh),
qui démarre **le point d'entrée réel** sous le même chargeur TypeScript que
`pnpm dev`, privé de son chargement explicite de `.env`.

Deux traits de ce harnais méritent d'être lus, parce qu'ils viennent tous deux
d'une erreur commise en l'écrivant :

- **Le verdict se lit dans la sortie, jamais dans la vivacité du process.** Une
  première version concluait sur « le process tourne-t-il encore ? » et se
  trompait dans les deux sens : une configuration valide fait tomber l'API sur sa
  connexion PostgreSQL (`P1000`) alors qu'elle a parfaitement franchi la porte,
  et un port occupé la fait tomber sans qu'aucune variable soit en cause. Les
  marqueurs observés encadrent la porte, ce qui rend au passage la vérification
  indépendante de toute base de données.
- **Les phases 1 à 3 tournent sans aucun `.env` sur le disque**, la fixture
  n'étant écrite qu'au moment de la phase 4. Sans cette séparation, le `.env` du
  poste de développement rendait la phase 1 redondante avec la phase 4 et
  brouillait ce que chacune prouve — l'asymétrie poste/runner de la rule 02,
  prise à l'envers : ici c'est le poste qui fabriquait un faux vert.

Le harnais exécute la **source** TypeScript, là où la production lance
`dist/main.js`. L'écart est sans conséquence ici, et pour une raison structurelle
plutôt que par constat : `tsc` compile un `await import()` en un `require()`
paresseux à l'intérieur de la fonction (`module: commonjs`), et n'a aucun moyen
de le hisser au-dessus des instructions qui le précèdent. L'ordre est donc une
propriété que le compilateur préserve, pas une coïncidence à revérifier.

AC-5 est le contrôle du contrôle. Le point d'entrée qu'il soumet reproduit
l'ordre exact du défaut, et sa sonde **doit parler**. Sans lui, une sonde cassée
resterait muette en toutes circonstances et AC-4 afficherait « ok » pour la pire
des raisons : il ne mesurerait plus rien. Le dépôt a déjà payé deux fois
l'absence d'un tel contrôle — un faux « ok » de `grep` en E3, et un plugin GritQL
en erreur rapporté avec un code de sortie 0 en B6.

**Pourquoi ces deux critères portent sur l'ordre et non sur le `.env`.** Ils
observaient d'abord le rattrapage lui-même : variable absente, `.env` présent,
donc démarrage attendu sous l'ancien ordre. Ce comportement est réel et mesuré —
`dotenv` 16.5.0 est empaqueté dans le runtime de `@prisma/client`, et un
`require('@prisma/client')` seul suffit à repeupler `DATABASE_URL` sur le poste
de développement. Mais **il ne s'est pas reproduit sur le runner Linux de la
CI**, où le même point d'entrée s'est vu refuser sa configuration. Une prémisse
qui dépend du comportement implicite d'une dépendance tierce, et qui varie d'un
environnement à l'autre, ne fait pas un bon contrôle : elle fait un contrôle
qu'on finit par supprimer pour cause de bruit.

La reformulation ne réduit pas la portée, elle l'élargit. L'invariant tenu n'est
plus « le `.env` de Prisma ne rattrape rien » mais « **aucun module applicatif
n'est chargé avant que la configuration ne soit validée** » — ce qui couvre
l'effet de bord de Prisma, ceux qu'une dépendance transitive introduira demain,
et dispense d'avoir à les inventorier.
