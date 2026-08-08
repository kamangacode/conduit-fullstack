---
id: REQ-ARCH-002
title: Prouver le contrat HTTP dans les deux directions, sur toutes les routes
type: non-functional
domain: architecture
status: implemented
priority: must
source: "PRD §7 (contrat d'API) et §8 (formats verbatim) ; plan d'outillage item C3 ; ADR 026"
acceptance_criteria:
  - id: AC-1
    given: "une projection de persistance modifiée pour rendre un champ non prévu par le contrat (spread de la ligne, forme que le compilateur laisse passer)"
    when: "la lane d'intégration s'exécute"
    then: "elle échoue — y compris sur un endpoint dont la spec ne porte aucune assertion de contrat écrite à la main"
  - id: AC-2
    given: "un corps de réponse portant une clé inconnue du schéma de sa route"
    when: "l'assertion de contrat du harnais l'examine"
    then: "elle le refuse, et nomme la clé en trop"
  - id: AC-3
    given: "un corps amputé d'un champ du contrat, ou dont un champ porte le mauvais type"
    when: "l'assertion de contrat du harnais l'examine"
    then: "elle le refuse — la même assertion porte donc les deux directions"
  - id: AC-4
    given: "une route montée par l'application et absente du registre de contrat"
    when: "la lane d'intégration démarre l'application"
    then: "elle échoue en nommant la méthode et le motif de la route, avant qu'aucun test ne s'exécute"
  - id: AC-5
    given: "une route déclarée sans corps de réponse (204) qui se met à en renvoyer un"
    when: "l'intercepteur observe la réponse"
    then: "il la refuse — un marqueur « pas de corps » est une affirmation vérifiée, pas une dispense"
  - id: AC-6
    given: "un champ du contrat retiré de la projection réelle qui construit la réponse"
    when: "le typecheck de `apps/api` s'exécute"
    then: "il échoue — ce qui prouve que le chemin de construction est lié au contrat, et non transtypé"
  - id: AC-7
    given: "la vérification de compilation, y compris interrompue ou en échec"
    when: "elle rend la main"
    then: "le dépôt est dans son état d'origine"
implementation:
  files:
    - apps/api/test/contract/route-contracts.ts
    - apps/api/test/contract/contract-assertion.ts
    - apps/api/test/contract/contract-registry-check.ts
    - apps/api/test/contract/contract-harness.ts
    - apps/api/test/integration/setup.ts
    - turbo.json
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - apps/api/test/contract/contract-harness.spec.ts
    - apps/api/test/integration/contract-harness.integration.spec.ts
    - scripts/verify-contract-types.sh
related:
  issues: []
  requirements:
    - REQ-ARCH-001
    - REQ-ERROR-001
    - REQ-CONF-001
  adrs:
    - "026"
---

# REQ-ARCH-002 — Prouver le contrat HTTP dans les deux directions, sur toutes les routes

## Contexte

Depuis F3, douze assertions affirment que les réponses de l'API sont conformes
aux schémas de `packages/shared`. Elles ont toutes la même forme :

```ts
expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
```

Zod retire les clés inconnues au lieu de les refuser. Cette assertion est donc
vraie d'un corps qui porterait, en plus des champs attendus, le condensat argon2
d'un compte ou l'email d'un profil tiers : le parse les écarte de `result.data`,
que l'assertion ne regarde pas, pendant que `response.body` — celui qui part au
client — les conserve. La propriété qui intéresse la sécurité, « rien d'autre ne
sort », n'était donc pas testée, alors que douze lignes donnaient l'impression du
contraire.

Le typage ne comble pas le trou : le contrôle de propriétés excédentaires de
TypeScript ne voit que les propriétés **nommées** d'un littéral. `{ ...row }`,
où `row` est une ligne de persistance plus large que le contrat, compile sans
broncher. C'est précisément la forme qu'un adapter écrit quand on veut aller
vite, et c'est celle que F2 avait écartée à la main.

Enfin, la couverture était laissée à l'attention du rédacteur : l'application
monte vingt routes, douze portaient une assertion. Une route ajoutée demain n'en
aurait aucune, et rien ne l'aurait dit.

## Règles

- L'assertion de contrat est **symétrique** : le corps doit passer le schéma
  **et** rester inchangé par le parse. La seconde moitié est la preuve d'absence
  de clé inconnue.
- La couverture ne repose pas sur la discipline : un intercepteur monté par le
  harnais de test confronte **toute** réponse de succès au schéma de sa route,
  et un contrôle au démarrage refuse une route absente du registre. L'intercepteur
  seul ne suffirait pas — il ne voit que les routes qu'un test exerce.
- Ce qui échappe au contrat le fait **par déclaration**, jamais par omission :
  la sonde `/health` est marquée hors contrat dans le registre, ce qui se relit.
- Le harnais est éprouvé contre lui-même. Un harnais qui rendrait toujours
  « conforme » afficherait du vert partout ; le dépôt a déjà attrapé un faux `ok`
  de cette famille sur un `grep` (E3) et un plugin Biome mort à code de sortie 0
  (ADR 024).

## Hors périmètre

- **Les réponses d'erreur.** Une 422 levée par le pipe de validation et une 404
  de route inconnue ne traversent pas l'intercepteur : elles partent par le
  chemin d'exception. Le contrat d'erreur (PRD §10) reste couvert par
  REQ-ERROR-001, par les assertions des specs d'intégration et par la suite Hurl.
- **La validation de sortie en production.** L'intercepteur n'est monté que par
  les tests. Le choix de ne pas parser à l'exécution, côté API comme côté front,
  est tranché par l'[ADR 026](../../../adr/026-tests-de-contrat-assertion-symetrique-et-intercepteur.md).
- **La conformité du contrat à la spec RealWorld**, qui relève de REQ-CONF-001
  et de la suite Hurl vendorée : cette exigence prouve que l'API respecte le
  contrat qu'elle déclare, pas que ce contrat est le bon.
