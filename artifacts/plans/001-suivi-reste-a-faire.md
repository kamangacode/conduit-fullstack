# Plan de suivi — reste à faire

> **Rôle de ce fichier.** Le plan d'outillage (hors dépôt) a grossi au point de mêler
> ce qui est fait, ce qui est bloqué et ce qui est constructible. Il reste la
> **mémoire des décisions** : pourquoi tel outil, pourquoi tel seuil, ce qui a été
> écarté et sur quelle mesure. Ce fichier-ci ne le remplace pas — il porte le
> **suivi opérationnel**, et une seule information par ligne : où en est chaque
> chantier et ce qui le bloque.
>
> **Une seule source par question.** L'état d'un travail vit dans son **issue
> GitHub**, jamais ici : dupliquer un état, c'est garantir qu'il divergera. Ce
> tableau ne porte que le *lien* et le *blocage*.
>
> Dernière revue : **2026-08-12**.

## État d'ensemble

| Phase | Gate | Reste |
|---|---|---|
| 0 → 4, R, F | ✅ atteints | — |
| **5** — production-grade | ✅ **atteint** (`e53ac96`) | 6 items, tous constructibles |
| **6** — méthodologie & release | ⏳ partiel | déploiement, et 2 items bloqués |

Le gate Phase 5 porte sur B7, C5 et C8 — **il est atteint, la phase ne l'est pas.**
Ne pas lire ce ✅ comme « Phase 5 terminée ».

Le gate Phase 6 demande « un merge déclenche le déploiement, le CHANGELOG se
génère, la matrice de traçabilité se produit ». Les deux derniers sont acquis
depuis la release **`v0.8.0`** ; il ne manque que le déploiement.

## Ce qui bloque, et sur qui

C'est la lecture la plus utile de ce tableau : **quatre chantiers ne dépendent pas
de travail supplémentaire**, mais d'un réglage ou d'une information.

| # | Chantier | Bloqué par |
|---|---|---|
| [#49](https://github.com/kamangacode/conduit-fullstack/issues/49) | Activer auto-merge, rendre les checks requis | un réglage de dépôt (5 min) |
| [#50](https://github.com/kamangacode/conduit-fullstack/issues/50) | Déploiement Railway + Vercel (D7) | identifiants |
| [#52](https://github.com/kamangacode/conduit-fullstack/issues/52) | Grille EMA (E5) | **définition du sigle**, introuvable dans le dépôt |
| [#51](https://github.com/kamangacode/conduit-fullstack/issues/51) | Rendre le cadre visible (E4) | un arbitrage éditorial |

## Phase 5 — constructible dès maintenant

- [ ] [#42](https://github.com/kamangacode/conduit-fullstack/issues/42) — **A5** coverage ratchet
- [ ] [#43](https://github.com/kamangacode/conduit-fullstack/issues/43) — **B5** chiffrement PII AES-256-GCM + blind index HMAC
- [ ] [#44](https://github.com/kamangacode/conduit-fullstack/issues/44) — **B8** Helmet + CSP + Throttler
- [ ] [#45](https://github.com/kamangacode/conduit-fullstack/issues/45) — **C6** pino + correlation id + OpenTelemetry
- [ ] [#46](https://github.com/kamangacode/conduit-fullstack/issues/46) — **C7** migration expand/contract + ADR
- [ ] [#47](https://github.com/kamangacode/conduit-fullstack/issues/47) — **C8 (2/2)** fast-check sur les invariants du domaine

**Un ordre qui économise du travail** : #43 (chiffrement PII) produit une vraie
migration en deux temps. La documenter *au moment où on la fait* règle #46 sans
inventer d'exemple. Et #45 décide de la question OTel vs Sentry, l'une des
décisions ADR encore ouvertes du plan.

## Phase 6 — reste

- [ ] [#49](https://github.com/kamangacode/conduit-fullstack/issues/49) — réglages de dépôt (auto-merge, checks requis)
- [ ] [#50](https://github.com/kamangacode/conduit-fullstack/issues/50) — **D7** déploiement
- [ ] [#51](https://github.com/kamangacode/conduit-fullstack/issues/51) — **E4** cadre visible (partiel)
- [ ] [#52](https://github.com/kamangacode/conduit-fullstack/issues/52) — **E5** grille EMA

**D5 est clos** : release-please n'est plus « posé », il a produit `v0.8.0`, son
tag, sa release et son `CHANGELOG.md`. La chaîne est éprouvée de bout en bout.

## Dettes et observations

- [ ] [#48](https://github.com/kamangacode/conduit-fullstack/issues/48) — 16 mutants survivent dans `user.ts` (62,79 %) — trouvé par la mesure, pas supposé
- [ ] [#53](https://github.com/kamangacode/conduit-fullstack/issues/53) — flake du job `Liens de documentation`, une occurrence, sans cause
- [ ] [#54](https://github.com/kamangacode/conduit-fullstack/issues/54) — `staging` dérive de `main` après chaque release
- [ ] [#33](https://github.com/kamangacode/conduit-fullstack/issues/33) — clés de cache ignorant l'identité du lecteur
- [ ] Les **6 constats `issue`** laissés sur la PR #26, jamais triés

## Backlog antérieur, non rouvert ici

Ces issues précèdent ce plan et gardent leur vie propre :
[#41](https://github.com/kamangacode/conduit-fullstack/issues/41) (modération LLM),
[#37](https://github.com/kamangacode/conduit-fullstack/issues/37) (fixtures du client API),
[#35](https://github.com/kamangacode/conduit-fullstack/issues/35) et
[#34](https://github.com/kamangacode/conduit-fullstack/issues/34) (TruffleHog),
[#23](https://github.com/kamangacode/conduit-fullstack/issues/23) (matrice de traçabilité),
[#22](https://github.com/kamangacode/conduit-fullstack/issues/22) (rules biome en `error`),
[#21](https://github.com/kamangacode/conduit-fullstack/issues/21) (composants > 50 lignes),
[#20](https://github.com/kamangacode/conduit-fullstack/issues/20) (OpenAPI + drift),
[#18](https://github.com/kamangacode/conduit-fullstack/issues/18) (SSE).

## Comment tenir ce fichier

1. **Une case se coche ici quand l'issue se ferme**, jamais avant.
2. **Aucun détail technique ici.** Le *pourquoi* d'une décision va dans un ADR, une
   leçon post-incident dans `artifacts/lessons.md`, un critère d'acceptation dans un
   REQ. Ce fichier ne porte que des liens et des blocages (rule 21, « trois
   registres, trois granularités, pas de chevauchement »).
3. **Une issue nouvelle s'ajoute ici le jour où elle est ouverte**, sinon ce plan
   redevient le document incomplet qu'il remplace.
