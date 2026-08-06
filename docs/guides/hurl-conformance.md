# Guide — Hurl et la suite de conformité

> Comment lire les fichiers `.hurl` du dépôt, et comment lancer la suite de
> conformité RealWorld en local comme en CI.
>
> Ce guide est le *comment s'en servir*. Le *pourquoi* (choix de vendorer la
> suite officielle, contrôle de dérive) est dans [ADR 016](../adr/016-suite-de-conformite-vendoree.md).

## Qu'est-ce que Hurl

**Hurl** est un outil en ligne de commande (écrit en Rust, bâti sur curl) qui
permet d'**écrire des requêtes HTTP en texte brut et d'y attacher des
assertions**. Un fichier `.hurl` est une suite de blocs *requête → réponse
attendue → vérifications*. On le lance avec `hurl fichier.hurl` ; il sort en
erreur dès qu'une assertion échoue — ce qui en fait un outil de **test d'API**.

Le format est lisible : pas de code, pas de framework, juste la requête telle
qu'elle part sur le fil.

## Anatomie d'un fichier `.hurl`

Chaque bloc suit toujours le même patron. Extrait de
`apps/api/conformance/hurl/articles.hurl` :

```hurl
POST {{host}}/api/articles          # méthode + URL
Authorization: Token {{token}}      # en-têtes
{ "article": { ... } }              # corps JSON
HTTP 201                            # ← statut ATTENDU (assertion)
[Asserts]                           # ← vérifications sur la réponse
jsonpath "$.article.slug" isString
jsonpath "$.article.tagList[0]" == "d_{{uid}}"
[Captures]                          # ← extraction pour les blocs suivants
slug: jsonpath "$.article.slug"
```

Les quatre mécanismes en jeu :

| Élément | Rôle |
|---|---|
| `HTTP 201` | Assertion sur le **code de statut** attendu. |
| `[Asserts]` + `jsonpath "..."` | Vérifient le **corps** de la réponse (type, valeur, présence). Par exemple `jsonpath "$.articles[0].body" not exists` prouve que la liste **omet** le body — la règle R-7 de la spec RealWorld. |
| `[Captures]` | **Extraient** une valeur (le `token`, le `slug`) pour la réutiliser dans les blocs d'après. |
| `{{host}}`, `{{uid}}`, `{{token}}` | **Variables** — injectées au lancement (`--variable host=…`) ou capturées en cours de route. |

Le `token` capturé au bloc *Register* est réinjecté dans l'en-tête
`Authorization` du bloc suivant : un fichier `.hurl` est un **scénario
enchaîné**, pas une requête isolée.

## Pourquoi c'est là : `conformance/`

Le dossier s'appelle `conformance/`, et le mot est fort. Ces 13 fichiers testent
que l'API respecte le **contrat externe RealWorld** (la spec que Conduit
implémente), du point de vue d'un vrai client HTTP. C'est un niveau au-dessus des
tests d'intégration Supertest :

- **Supertest** (`apps/api/test/integration/`) monte l'app NestJS en mémoire et
  l'interroge — même processus, assertions écrites par nous.
- **Hurl** tape sur l'API **par le réseau**, comme le ferait le front ou un
  client tiers, et ses assertions viennent de la spec, pas de nous. Il valide le
  contrat tel qu'il est réellement servi, indépendamment de l'implémentation.

C'est l'étape *conformité* du cycle de build : chaque feature doit passer son
bloc Hurl avant d'être considérée finie.

## Lancer la suite : le plus simple

```bash
pnpm --filter @repo/api conformance
```

Le script `apps/api/scripts/test-conformance.sh` fait **toute l'orchestration** ;
rien à préparer :

1. Démarre une base Postgres **jetable et dédiée** (`conduit_conformance`,
   service Docker `postgres-test` en tmpfs) — distincte de la base de dev et de
   la lane d'intégration, donc elles tournent en parallèle sans collision.
2. Applique les migrations (`prisma migrate deploy`) puis **vide** la base
   (`TRUNCATE`) — la suite officielle exige une base vierge (REQ-CONF-001).
3. **Build l'API** via turbo et lance `dist/main.js` (l'artefact **compilé**,
   pas les sources) sur le port `3999`, en `NODE_ENV=production`.
4. Attend que l'API réponde, puis lance Hurl sur les 13 fichiers.
5. Un `trap cleanup` arrête l'API à la fin, même sur Ctrl-C.

Deux détails délibérés :

- La suite tourne contre `dist/main.js` **compilé** : un défaut introduit par la
  compilation (alias non réécrits, décorateurs perdus) ne se verrait sur aucune
  autre lane.
- Le script passe `CORS_ORIGIN` à l'API : la configuration CORS est éprouvée
  jusque dans la conformité.

## Lancer Hurl seul (apprentissage / débogage)

Pour voir Hurl brut, sans l'orchestration, contre une API déjà démarrée
(par exemple le serveur de dev sur `:3001`) :

```bash
# un seul fichier
hurl --test --variable host=http://localhost:3001 --variable uid=demo123 \
  apps/api/conformance/hurl/tags.hurl

# toute la suite, séquentiel (obligatoire, voir ci-dessous)
hurl --test --jobs 1 --variable host=http://localhost:3001 --variable uid=demo123 \
  apps/api/conformance/hurl/*.hurl
```

⚠️ **Attention** : lancé ainsi, Hurl écrit dans la base que l'API visée utilise
(donc la base de dev si tu vises `:3001`). C'est précisément pourquoi le script
de conformité **refuse** toute base dont le nom ne contient pas `conformance` :
c'est une suite qui `TRUNCATE`. Pour juste *voir* Hurl fonctionner, `tags.hurl`
seul est inoffensif (lecture + un tag).

Le `--jobs 1` (séquentiel) n'est pas optionnel : les fichiers partagent des
ressources globales (liste des tags, pagination du flux public), et les
paralléliser produirait des échecs qui ne disent rien de la conformité.

## En CI

Un job dédié `conformance` (`.github/workflows/ci.yml`) :

- Un **service Postgres** du job fournit `conduit_conformance` via
  `CONFORMANCE_DATABASE_URL` → le script saute le démarrage Docker et prend
  cette base.
- Hurl n'étant pas un paquet npm, il est installé comme **binaire** (le `.deb`
  de la release officielle, même version que celle utilisée en local).

## En résumé

| | `pnpm conformance` | `hurl` à la main |
|---|---|---|
| Base | jetable, créée automatiquement (Docker) | celle de l'API visée ⚠️ |
| API | build + lancée sur `:3999` | doit déjà tourner |
| Usage | CI + vérification locale sérieuse | comprendre ou déboguer un fichier |

## Références

- [ADR 016 — suite de conformité RealWorld vendorée](../adr/016-suite-de-conformite-vendoree.md) : la décision et le contrôle de dérive.
- Script d'orchestration : `apps/api/scripts/test-conformance.sh`.
- Suite : `apps/api/conformance/hurl/*.hurl` (13 fichiers).
- Documentation Hurl : <https://hurl.dev>.
