# ADR 016 — Suite de conformité RealWorld vendorée, avec contrôle de dérive

## Status

Accepted — 2026-08-05.

## Context

Le PRD §15 désigne la suite **Hurl** de `realworld-apps/realworld`
(`specs/api/hurl/`) comme la source de vérité du contrat externe : 13 fichiers,
1 709 lignes, 84 requêtes. C'est elle, et non notre lecture de la spec, qui dit
si `apps/api` est conforme. Le tableau §15.3 l'assigne explicitement à ce dépôt
(« Hurl au vert sur l'API + e2e Playwright sur le front »).

Cette suite est **écrite par un tiers et évolue** : son dernier commit à ce jour
(`450bbc5`, 2026-05-05) ajoute une politique de mot de passe NIST 800-63B qui
n'existait pas dans les versions précédentes. Un dépôt qui prétend être conforme
doit donc dire *à quelle version* du contrat il l'est, et savoir quand cette
version bouge.

Trois contraintes se croisent :

- la suite doit tourner en **CI** comme un gate, donc de façon déterministe et
  sans dépendre d'un service tiers au moment du run ;
- l'exécution doit rester **reproductible à froid** : un contributeur qui clone
  le dépôt six mois plus tard doit obtenir exactement le même verdict ;
- la conformité ne vaut que si elle porte sur la **suite officielle**, pas sur
  une copie qu'on aurait retouchée pour la faire passer — c'est le mode d'échec
  qui rendrait tout l'exercice décoratif.

La troisième contrainte est la seule qui compte vraiment, et c'est celle qu'une
simple copie ne protège pas.

## Options Considered

| Option | Trade-off |
|---|---|
| **A — Copie vendorée + contrôle de dérive (retenue)** | Run hors ligne et déterministe, un fichier réel dans le dépôt qu'on peut lire et citer. Un script compare la copie à l'amont épinglé et signale toute divergence, dans les deux sens : notre retouche comme leur évolution. Coût : une machinerie de plus à maintenir. |
| B — Copie vendorée seule, SHA documenté | Le plus léger. Écarté : rien n'empêche de retoucher une assertion gênante, et rien ne signale une évolution amont. La copie devient une spec maison qui *ressemble* au contrat, ce qui est pire que pas de suite du tout — on s'y fierait. |
| C — Téléchargement au run, épinglé au SHA | Toujours démontrablement la suite officielle, aucune copie à maintenir. Écarté : un gate de CI qui dépend de `raw.githubusercontent.com` échoue pour une raison sans rapport avec le code, et le run local devient impossible hors ligne. On ferait dépendre le verdict de conformité de la disponibilité de GitHub. |

## Decision

La suite officielle est **copiée telle quelle** sous
`apps/api/conformance/hurl/`, épinglée au commit amont
`450bbc5410c7c1b7feca0f238e002162468e2a6c`, enregistré dans
`apps/api/conformance/UPSTREAM.md` avec la date et l'URL.

**Les fichiers `.hurl` ne sont jamais édités.** C'est l'invariant que porte tout
l'ADR : une assertion qui échoue est un défaut de notre API, jamais une
assertion à corriger. Si le contrat officiel était réellement fautif, la voie
est un correctif en amont, pas une retouche locale.

`scripts/check-conformance-drift.sh` récupère l'arborescence amont au SHA
épinglé et compare **octet pour octet**. Il signale deux situations distinctes :

- un fichier local modifié, ajouté ou supprimé — quelqu'un a retouché le
  contrat ;
- le SHA épinglé qui ne correspond plus au `HEAD` amont — le contrat a évolué et
  la copie a une version de retard.

Ces deux situations n'ont pas le même sens, et le script les distingue dans son
message. La première est un défaut ; la seconde est une information. Le contrôle
est donc **rapporté, jamais bloquant** (rule 21, étape 3 : on mesure le bruit
avant de gater) — il dépend du réseau, et faire échouer la CI de chaque PR parce
qu'un tiers a publié un commit ce matin serait exactement le gate qu'on
désactiverait dans six mois.

L'exécution de la suite, elle, est un **gate**
(`scripts/test-conformance.sh`, job CI `Conformance`) : elle ne dépend d'aucun
réseau une fois la copie en place.

## Consequences

### Positive

- Le verdict de conformité est reproductible et hors ligne : la CI et le poste
  local exécutent le même octet.
- La retouche silencieuse d'une assertion devient détectable — c'est la seule
  triche qui rendrait la suite inutile, et elle est désormais mécanisée.
- Le dépôt porte un fichier réel et lisible pour chaque assertion du contrat,
  plutôt qu'une dépendance invisible.
- L'écart avec l'amont devient une information datée plutôt qu'une surprise :
  on sait *quand* le contrat a bougé sous nos pieds.

### Negative

- Deux copies d'un même contenu existent (amont et locale) : c'est précisément
  la duplication que le dépôt combat ailleurs. Elle est acceptée ici parce que
  l'original est hors de notre contrôle et que le contrôle de dérive rend la
  divergence visible — mais elle reste une duplication.
- Le contrôle de dérive dépend du réseau et de la disponibilité de GitHub, donc
  il ne peut pas devenir bloquant sans importer cette fragilité.
- Remonter la copie à une nouvelle version amont est un geste manuel, qui peut
  faire rougir la suite d'un coup sur des assertions qu'on n'a pas écrites.

### Neutral

- La collection **Bruno** (`specs/api/bruno/`), générée depuis Hurl en amont,
  n'est pas vendorée : elle est équivalente par construction et n'ajoute aucune
  couverture. Le PRD §15.1 la donne comme alternative de confort GUI.
- L'`openapi.yml` officiel n'est pas non plus vendoré ici : il est le contrat
  d'entrée du dépôt `conduit-api-first`, pas de celui-ci (PRD §15.3).
- Le seuil de bascule du contrôle de dérive en gate n'est pas fixé. Il le sera
  si le rapport se révèle stable sur plusieurs itérations — ou jamais, si la
  dépendance réseau reste jugée disqualifiante.
