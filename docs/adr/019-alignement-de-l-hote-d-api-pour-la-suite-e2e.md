# ADR 019 — Aligner l'hôte d'API du navigateur sur celui que la suite e2e intercepte

## Status

Accepted — 2026-08-06. Précise [018 — Conformité e2e : suite officielle vendorée](018-conformite-e2e-suite-officielle-vendoree.md) sur le câblage réseau du run, sans l'amender : la suite reste vendorée et jamais éditée.

## Context

La suite e2e officielle vendorée rend 46 tests en échec sur 139. En rejouant le
lot le plus gros ([#12](https://github.com/kamangacode/conduit-fullstack/issues/12),
24 tests), une asymétrie apparaît dans la suite elle-même.

Ses helpers lisent l'hôte de l'API dans une variable d'environnement :

```ts
// conformance/e2e/helpers/config.ts
export const API_BASE = process.env.API_BASE || 'https://api.realworld.show/api'
```

Mais **deux fichiers de specs** — `error-handling.spec.ts` et
`user-fetch-errors.spec.ts`, et eux seuls sur les douze — le figent :

```ts
// error-handling.spec.ts, user-fetch-errors.spec.ts
const API_BASE = 'https://api.realworld.show/api'
await page.route(`${API_BASE}/user`, …)
```

`page.route()` filtre sur l'**URL demandée par le navigateur**. Tant que le front
sous test interroge `http://localhost:3101/api`, aucune de ces interceptions ne
matche : les mocks ne s'appliquent pas, et les 24 tests éprouvent l'API réelle au
lieu des pannes qu'ils décrivent. Les cas 4xx « passent » parce que l'API répond
401 au faux jeton qu'ils posent ; les cas 5xx et réseau échouent pour la même
raison. 19 + 5 = 24, exactement le compte du lot.

La conséquence est structurelle, et c'est elle qui force une décision :
**aucune correction du front ne peut rendre ces tests verts.** Le comportement
qu'ils décrivent — mode dégradé, messages de transport, coquilles de page — a été
implémenté ([REQ-WEB-016](../requirements/functional/web/REQ-WEB-016.md),
[017](../requirements/functional/web/REQ-WEB-017.md),
[018](../requirements/functional/web/REQ-WEB-018.md)) et n'a fait bouger le
verdict que de 4 tests, ceux qui tombaient sur des 404 réels sans dépendre d'un
mock.

L'[ADR 018](018-conformite-e2e-suite-officielle-vendoree.md) interdit de retoucher
la suite, et le contrôle de dérive le vérifie octet pour octet. La question
n'est donc pas « comment corriger ces fichiers » mais « que fait-on d'une suite
qui suppose de son environnement quelque chose que le nôtre ne lui donne pas ».

## Options Considered

### A. Aligner l'URL du navigateur et résoudre l'hôte vers l'API locale

Le front est construit avec `NEXT_PUBLIC_API_URL=https://api.realworld.show/api`,
et Chromium résout cet hôte vers un terminateur TLS local qui relaie vers l'API
du run (`--host-resolver-rules`, certificat auto-signé jetable).

Les mocks matchent alors comme l'amont l'entend, et **les requêtes non
interceptées atterrissent sur notre API**, jamais sur la démo publique.

Coût : un processus de plus dans l'orchestration (~90 lignes commentées), un
certificat généré à chaque run, et une seconde URL d'API — celle que le **rendu
serveur** emprunte, qui doit rester directe.

### B. Déclarer les 24 tests hors du verdict

Un ADR actant que ces deux fichiers éprouvent le déploiement de référence et non
un backend auto-hébergé ; le verdict devient « 115 exécutables, 24 non
applicables », et la bascule du job en gate
([#17](https://github.com/kamangacode/conduit-fullstack/issues/17)) partirait avec
une liste d'exclusion déclarée.

Coût nul, mais le gate perd la couverture de tout ce qui touche aux pannes — la
famille de comportements que personne ne teste à la main, et donc celle où une
régression passerait le plus longtemps inaperçue. Une exclusion déclarée reste
une exclusion : elle se relit six mois plus tard comme une décision de confort.

### C. Ne rien faire et avancer sur les quatre autres lots

Aucun d'eux ne fige l'hôte, ils sont tous corrigibles côté front. Mais l'épique
resterait ouverte sur un point non tranché, et la question se reposerait à
l'identique au moment de fermer.

## Decision

**Option A.**

Trois éléments, tous côté harnais, aucun côté suite :

1. `scripts/e2e-tls-terminator.mjs` — serveur HTTPS jetable qui relaie vers
   l'API du run. Il ne comprend rien au contrat Conduit et ne doit rien y
   comprendre : toute logique ajoutée là deviendrait une différence entre ce que
   la suite éprouve et ce que l'API sert.
2. `playwright.config.ts` — `--host-resolver-rules=MAP api.realworld.show
   127.0.0.1:<port>` et `ignoreHTTPSErrors`. C'est la règle de résolution qui
   garde le run **hors ligne**.
3. `SERVER_API_URL` — URL de l'API vue depuis le processus de rendu. Le
   navigateur et le serveur n'atteignent pas l'API par le même chemin : le
   premier a besoin de l'hôte que la suite intercepte, le second doit continuer
   d'appeler directement, sans DNS public ni TLS.

La distinction qui autorise tout ceci : **on ne touche ni aux assertions, ni aux
délais, ni aux `retries`**. Relever `timeout` ou `expect.timeout` ferait passer
des tests que le contrat déclare en échec — c'est la triche que la rule 13
nomme. Ici, le contrat éprouvé reste mot pour mot celui de l'amont ; c'est le
câblage réseau qui devient conforme à ce que la suite suppose de son
environnement.

## Consequences

### Positive

- Les 24 tests du lot deviennent **exécutables** : leurs échecs redeviennent des
  informations sur le front, ce qu'ils n'étaient pas.
- Le run reste hors ligne. Mieux qu'avant, même : la vérification du relais
  (REQ-CONF-002 AC-7) échoue bruyamment si l'hôte n'est pas capturé, là où rien
  n'empêchait auparavant une requête de partir vers la démo publique — et de la
  modifier.
- `SERVER_API_URL` documente une distinction qui existait déjà sans être nommée,
  et qui se reposera en production : l'URL publique d'une API n'est pas celle par
  laquelle son propre front la joint.

### Negative

- Un processus de plus à orchestrer, donc un mode d'échec de plus au démarrage —
  fermé par une vérification explicite avant que le front ne démarre.
- Le run dépend d'`openssl`, présent sur macOS comme sur les runners Ubuntu, mais
  c'est une dépendance de plus qu'un `curl`.
- Le montage est **spécifique à Chromium** (`--host-resolver-rules`). Étendre la
  suite à Firefox ou WebKit demanderait un autre mécanisme — un proxy déclaré,
  ou une entrée `/etc/hosts` que seul un runner accepte sans friction.

### Neutral

- Le certificat est auto-signé, régénéré à chaque run, jamais installé dans un
  magasin de confiance et supprimé au trap. Il n'est accepté que par le
  navigateur de test.
- L'hôte et le port sont paramétrables (`E2E_MOCKED_API_HOST`, `E2E_TLS_PORT`) :
  le jour où l'amont corrige ses deux fichiers, retirer ce montage revient à
  repointer `NEXT_PUBLIC_API_URL` sur l'API locale et à supprimer trois blocs.
