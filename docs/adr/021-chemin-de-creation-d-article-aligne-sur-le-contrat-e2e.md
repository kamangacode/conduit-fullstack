# ADR 021 — Aligner le chemin de création d'article sur la forme que la suite e2e intercepte

## Status

Accepted — 2026-08-06. Précise [018 — Conformité e2e sur la suite officielle vendorée](018-conformite-e2e-suite-officielle-vendoree.md) et prolonge [019 — Alignement de l'hôte d'API pour la suite e2e](019-alignement-de-l-hote-d-api-pour-la-suite-e2e.md) : même invariant (on répare le montage, jamais le test), appliqué cette fois au **chemin** et non plus à l'hôte.

## Context

La suite e2e officielle est vendorée et ne s'édite jamais
([ADR 016](016-suite-de-conformite-vendoree.md),
[ADR 018](018-conformite-e2e-suite-officielle-vendoree.md)). Un de ses tests,
*should show error message on create article form when network fails*, installe
son interception ainsi :

```ts
await page.route(`${API_BASE}/articles/`, route => {
  route.abort('internetdisconnected');
});
```

La **barre finale** est significative. Playwright compile un motif de chaîne en
expression régulière **ancrée** : un motif sans joker est d'abord résolu par
`new URL()` puis comparé en entier. `…/api/articles/` n'intercepte donc pas un
`POST …/api/articles`.

Notre client émettait la seconde forme. Conséquence, entièrement mécanique :
l'abort ne se déclenchait jamais, la requête partait vers l'API du run (relayée
par le terminateur TLS de l'[ADR 019](019-alignement-de-l-hote-d-api-pour-la-suite-e2e.md)),
le jeton factice `fake-token-for-testing` y récoltait un 401, la session se
purgeait et l'éditeur redirigeait. La capture d'échec montrait la page de
connexion et aucun `.error-messages` — un diagnostic qui ne parlait ni du
message d'erreur, ni de la panne réseau, ni de rien de ce que le test décrit.

Un second test de la même suite, *should handle 400 on article creation*, route
`…/api/articles` **sans** barre. Les deux paraissent contradictoires ; ils ne le
sont pas. Le second remplit un titre et un corps vides, que la validation
partagée (`createArticleDtoSchema`) refuse **avant** tout appel réseau : son
assertion — `.error-messages` visible, `input[name="title"]` toujours là — est
satisfaite sans qu'aucune requête ne parte. Son interception est morte dans les
deux mondes.

La question posée est donc étroite : **le chemin d'une requête est-il un détail
d'implémentation, ou une donnée du contrat externe ?**

## Options Considered

| Option | Trade-off |
|---|---|
| **A (retenue) — Émettre `/articles/` en création, et le dire** | Le test devient exécutable et éprouve ce qu'il décrit. Coût : une asymétrie visible entre création (`/articles/`) et modification (`/articles/:slug`), qui a l'air d'une faute de frappe et invite au « nettoyage ». Un commentaire et cet ADR sont la contrepartie obligatoire. |
| B — Déclarer le test non applicable | Coût nul aujourd'hui. Mais la liste des non-applicables devient l'endroit où l'on range ce qu'on ne veut pas regarder, elle se relit à chaque montée de version, et le gate visé par [#17](https://github.com/kamangacode/conduit-fullstack/issues/17) ne peut plus viser zéro rouge. Surtout : le comportement décrit (panne réseau à la publication) est réel et resterait non éprouvé. |
| C — Retoucher la suite vendorée (supprimer la barre) | Une ligne. C'est exactement la triche que l'ADR 018 interdit : la suite cesserait d'être l'assertion d'un tiers, et rien ne distinguerait plus « le front est conforme » de « nous avons ajusté le contrôle ». |
| D — Émettre les deux (une requête sur chaque forme) | Absurde en production : deux articles créés pour un clic. Cité pour mémoire. |

## Decision

Le chemin de création d'article est **`/articles/`**, barre finale comprise, posé
en constante nommée dans `apps/web/src/lib/api-client.ts` :

```ts
const CREATE_ARTICLE_PATH = '/articles/'
```

Trois précisions font partie de la décision :

1. **Une seule occurrence.** La constante est déclarée une fois et utilisée une
   fois. Un chemin de contrat recopié à deux endroits diverge au premier
   remaniement, et la divergence ne se voit qu'en e2e.
2. **Les autres chemins ne bougent pas.** La liste globale reste `/articles`, le
   flux personnel `/articles/feed`, la modification `/articles/:slug`. Seule la
   **création** porte la barre, parce que seule la création est interceptée sous
   cette forme.
3. **Rien ne change côté API.** Le routeur d'`apps/api` répond identiquement aux
   deux formes (Express ne distingue pas la barre finale hors *strict routing*),
   et la suite de conformité HTTP ([REQ-CONF-001](../requirements/non-functional/conformance/REQ-CONF-001.md))
   continue d'interroger `/articles`. Aucun contrat serveur n'est modifié.

Ce changement ne se fait pas seul : il **suppose** que l'éditeur survive à une
purge de session ([REQ-WEB-019](../requirements/functional/web/REQ-WEB-019.md)).
Sans elle, le test *400 on article creation* — dont le mock ne matche plus —
recevrait un vrai 401 de l'API, la session serait purgée et l'éditeur
redirigerait avant que `.error-messages` ne soit lisible. On ferait passer un
test en en cassant un autre. L'ordre est une donnée de la décision, pas une
recommandation.

## Consequences

### Positive

- Un test de la suite officielle éprouve enfin ce qu'il décrit : le message
  d'échec de transport sur le formulaire de publication, formulaire toujours
  utilisable.
- La règle générale se lit maintenant dans le dépôt : **un chemin d'API consommé
  par un contrat externe est une donnée de contrat**, au même titre qu'un
  sélecteur ([ADR 014](014-conformite-au-contrat-de-selecteurs-e2e.md)) ou que le
  message d'indisponibilité ([REQ-WEB-017](../requirements/functional/web/REQ-WEB-017.md)).
  Trois occurrences de la même famille : la conformité contraint des choses qui
  ressemblent à des choix internes.
- Le correctif vit dans **notre** code, pas dans la copie vendorée :
  `pnpm conformance:drift` reste vert, octet pour octet.

### Negative

- **Une asymétrie qui a l'air d'un bug.** `POST /articles/` à côté de
  `GET /articles` provoquera un « tiens, une coquille » chez le prochain
  lecteur. La seule défense est le commentaire au-dessus de la constante et cet
  ADR : un jour, quelqu'un supprimera la barre en croyant nettoyer, et la seule
  chose qui le rattrapera est le test e2e — non bloquant à la date de cet ADR,
  bloquant depuis le 2026-08-07
  ([ADR 018](018-conformite-e2e-suite-officielle-vendoree.md), second temps). La
  défense est donc passée de « quelqu'un lira le journal » à « la CI refuse le
  commit ».
- **Le chemin est figé par un tiers.** Une future version de la suite qui
  écrirait `…/articles` remettrait la décision en jeu. C'est le coût général du
  vendoring assumé par l'ADR 016, pas une conséquence propre à celui-ci.
- **Une dépendance d'ordre** entre deux changements qui, pris isolément,
  paraissent indépendants (le chemin et la survie de l'éditeur à une purge).
  Les inverser fait régresser un test vert.

### Neutral

- Le test *400 on article creation* passe désormais **par la validation
  cliente** et non par son mock. Son vert est honnête — l'assertion porte sur le
  formulaire, et le formulaire se comporte comme décrit — mais il n'éprouve plus
  le traitement d'un 400 réel. Ce chemin-là reste couvert par les tests de couche
  de `ArticleEditor` (REQ-WEB-014 AC-7), qui sont la preuve au sens de la
  rule 20 ; l'e2e n'en est que la confrontation.
- Aucun impact sur `apps/api`, sur `packages/shared` ni sur la suite de
  conformité HTTP.
- La bascule du job e2e en gate reste un geste distinct et ultérieur
  ([#17](https://github.com/kamangacode/conduit-fullstack/issues/17),
  [REQ-CONF-002](../requirements/non-functional/conformance/REQ-CONF-002.md) AC-5).
