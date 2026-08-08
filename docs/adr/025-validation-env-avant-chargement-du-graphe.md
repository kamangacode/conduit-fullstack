# ADR 025 — Valider l'environnement avant de charger le graphe applicatif

## Status

Accepted — 2026-08-08.

## Context

La rule 19 du cadre de développement et
[REQ-SEC-004](../requirements/non-functional/security/REQ-SEC-004.md) demandent
la même chose : une configuration manquante doit empêcher le démarrage, jamais
produire une dégradation silencieuse. L'item B1 du plan d'outillage l'avait
implémenté en Phase R — schéma Zod pur dans `apps/api/src/config/env.ts`,
`parseEnv` appelé en tête de `bootstrap()`, 12 tests unitaires, et un fail-fast
constaté à la main sur un vrai démarrage.

Le 2026-08-08, en vérifiant le gate de la Phase 3, l'API a démarré entièrement —
34 routes montées — **sans `DATABASE_URL` ni `JWT_SECRET` dans son
environnement**. `parseEnv` n'était pas en cause : appelé directement sur le même
environnement amputé, il refusait correctement et nommait les deux variables.

La cause est un ordre d'exécution. `main.ts` importait `AppModule` statiquement.
Les imports sont hoistés : le graphe de modules s'évalue avant la première
instruction de `bootstrap()`. Ce graphe tire `@prisma/client`, qui charge le
fichier `.env` dans `process.env` comme effet de bord de son `require` — mesuré
module par module, ni `reflect-metadata` ni `@nestjs/core` ne le font. L'ordre
réel était donc : `.env` chargé, puis validation. Le commentaire de `main.ts`
affirmait pourtant que la validation avait lieu « avant NestJS, avant la moindre
connexion ».

Trois propriétés de ce défaut expliquent qu'il ait survécu à la Phase R :

- il est **invisible à la lecture** — aucune ligne du dépôt ne charge `.env`,
  c'est une dépendance transitive qui le fait ;
- il est **invisible aux tests unitaires** — `env.spec.ts` teste une fonction
  pure, et une fonction pure n'a pas d'ordre d'exécution vis-à-vis d'un graphe
  d'imports ;
- il est **invisible sur un poste de développement** — la vérification manuelle
  de la Phase R tournait sur une machine portant un `apps/api/.env` valide, donc
  elle constatait un démarrage réussi et concluait que tout allait bien.

`dotenv` n'écrase pas une variable déjà posée. La conséquence n'est donc pas
qu'un fichier remplace une valeur légitime, mais qu'il **comble le trou** que le
fail-fast a pour seul rôle de signaler : une image de production embarquant un
`.env` par accident démarre avec les valeurs du fichier au lieu de celles que la
plateforme n'a pas injectées. Le dépôt n'a aujourd'hui ni `Dockerfile` ni
`.dockerignore`, donc rien ne s'y oppose structurellement.

## Options Considered

| Option | Trade-off |
|---|---|
| **A — Import dynamique de `AppModule` après la validation (retenue)** | Une ligne change (`import … from` devient `await import(…)`), l'ordre devient explicite et local, et la raison se lit à l'endroit exact où elle s'applique. Coûte un import dynamique, forme moins courante qu'un import statique et qu'un relecteur pourrait « corriger » — d'où la vérification exécutable qui l'accompagne. |
| B — Module de préflight importé en premier (`import './config/preflight'`) | Rétablit l'ordre sans import dynamique, mais fait dépendre la correction de **l'ordre des lignes d'import**, qu'un organiseur d'imports peut réécrire sans que personne ne le voie en revue. Échange un piège invisible contre un autre. |
| C — Charger explicitement `.env` en tête de `main.ts`, puis valider | Rend le chargement visible, mais officialise en production un mécanisme réservé au développement : `pnpm dev` passe déjà `--env-file-if-exists`, et la plateforme d'hébergement injecte l'environnement. Ajoute une dépendance et une surface de configuration sans rien résoudre du fond. |
| D — Ne rien changer, documenter la limite | Gratuit, et défendable puisque la production n'a pas de `.env`. Mais laisse une assertion fausse dans le code (« avant NestJS »), et fait reposer une propriété de sécurité sur l'absence d'un fichier que rien ne garantit. |

## Decision

`apps/api/src/main.ts` valide l'environnement **avant** de charger le graphe
applicatif, en important `AppModule` dynamiquement à l'intérieur de
`bootstrap()`, après `loadEnvOrExit()`. Les imports statiques restants
(`reflect-metadata`, `@nestjs/core`, `./config/env`,
`./interface/http-conventions`) sont sans effet de bord sur `process.env`, ce qui
a été vérifié module par module.

L'ordre n'est pas laissé à la garde d'un commentaire.
[`scripts/verify-env-fail-fast.sh`](../../scripts/verify-env-fail-fast.sh)
démarre le point d'entrée réel sur cinq configurations invalides et exige un
arrêt qui nomme la variable, puis — c'est le critère central — refait le test
avec un `.env` présent sur le disque qui définirait la variable manquante. Sa
phase 5 soumet au même harnais un point d'entrée reproduisant l'ancien ordre et
**exige de le voir démarrer** : sans ce contrôle négatif, un harnais cassé
afficherait « ok » partout. Le script tourne en pre-push et dans le job CI
`Quality`.

Un `.dockerignore` exclut par ailleurs les fichiers `.env` de tout contexte de
build d'image, pour que la question ne se pose pas au moment où un `Dockerfile`
apparaîtra.

## Consequences

### Positive

- Le fail-fast tient désormais **indépendamment de la présence d'un `.env`**,
  donc dans le seul cas où il compte : celui où l'opérateur a oublié une
  variable.
- La propriété est prouvée par exécution du vrai point d'entrée, à chaque push et
  en CI. C'est la différence entre « validé une fois à la main » et « ne peut
  plus régresser en silence ».
- Le contrôle négatif rend le harnais capable de démontrer qu'il détecte le
  défaut d'origine — un canary qui ne sait pas échouer ne prouve rien, leçon déjà
  payée sur un `grep` en E3 et sur un plugin GritQL en B6.
- La correction sert directement REQ-PRIV-008 du PRD de conformité RGPD, qui
  demande cette même propriété pour les futurs secrets de conformité.

### Negative

- `await import()` est une forme moins familière qu'un import statique. Un
  relecteur pressé, ou un outil de réécriture automatique, peut vouloir la
  « normaliser » — le commentaire explique pourquoi, et la vérification rougit si
  quelqu'un passe outre.
- La vérification démarre sept fois le process sous `ts-node`, soit une
  quarantaine de secondes ajoutées au pre-push et au job `Quality`. Coût réel,
  assumé : c'est le seul niveau où la propriété est observable.
- Le script déplace temporairement `apps/api/.env` pour se donner une fixture
  déterministe, et le restaure par trap. Un développeur qui tue le script au
  mauvais instant retrouve son fichier dans le répertoire temporaire du run —
  contrepartie du même parti pris que `verify-type-boundary.sh`.

### Neutral

- Le périmètre est le seul point d'entrée de l'API. Les tests d'intégration
  construisent leur application via `applyHttpConventions` sans passer par
  `main.ts` : ils ne sont pas concernés, et n'ont pas à l'être.
- `pnpm dev` continue de charger `.env` par `--env-file-if-exists`, avant tout
  module. C'est le geste explicite d'un développeur sur sa machine, pas un effet
  de bord — la distinction est exactement ce que cet ADR rétablit.
- La vérification s'arrête à « la configuration est acceptée » et ne prouve pas
  que l'API sert du trafic : le démarrage complet suppose une PostgreSQL
  joignable, que le job `Quality` n'a pas. Cette part est déjà couverte par les
  137 tests d'intégration.
