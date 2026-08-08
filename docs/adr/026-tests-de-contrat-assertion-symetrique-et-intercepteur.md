# ADR 026 — Tests de contrat : assertion symétrique et intercepteur de harnais

## Status

Accepted — 2026-08-08. Item C3 du plan d'outillage (« tests de contrat : schémas
Zod de `shared` testés runtime + types vérifiés à la compilation »).

## Context

Le dépôt affirme depuis F3 que ses réponses HTTP sont validées contre les schémas
de `packages/shared`. L'entête de `article-http.integration.spec.ts` l'écrit noir
sur blanc : « ce qui passe ici est exactement ce que le front saura lire ». Douze
assertions le soutiennent, toutes de la même forme :

```ts
expect(articleResponseSchema.safeParse(response.body).success).toBe(true)
```

**Cette assertion ne prouve qu'une direction du contrat.** Fait mesuré avant
d'écrire cet ADR, sur les schémas réels du dépôt :

```
safeParse d'un `user` portant en plus passwordHash et un id interne → success: true
valeur retenue par le parse : { email, token, username, bio, image }
safeParse d'un `profile` portant en plus l'email du compte → success: true
```

Zod v4 **retire** les clés inconnues d'un `z.object` au lieu de les refuser. La
valeur nettoyée part dans `result.data`, que l'assertion ne regarde pas — et ce
qui part au client est `response.body`, c'est-à-dire l'objet non nettoyé. Une API
qui laisserait fuiter le condensat argon2 ou l'email d'un profil tiers passerait
donc les 137 tests d'intégration, la suite Hurl (qui vérifie les champs attendus,
pas l'absence des autres) et la revue, sans qu'aucun voyant ne change de couleur.

Aucune fuite n'existe aujourd'hui : les projections de `infrastructure/persistence`
sont écrites champ par champ, précisément pour cette raison (F2 : « un spread
ferait fuiter email + condensat »). Le verrou est donc **préventif**, comme le
verrou SQL de l'[ADR 024](024-verrou-sql-brut-plugin-biome.md) — et pour la même
raison, il ne vaut que s'il est éprouvé activement.

**Le typage ne rattrape pas ce trou, et c'est mesuré.** Le contrôle de propriétés
excédentaires de TypeScript ne s'applique qu'aux propriétés **nommées** d'un
littéral. Soumis à `tsc --strict`, sur une fonction qui doit rendre un `Profile` :

| Forme écrite | Verdict de `tsc` |
|---|---|
| `({ username, bio, image, following, extra: 1 })` | **refusé** — `TS2353: 'extra' does not exist in type 'Profile'` |
| `({ ...row })`, où `row` porte en plus `email` et `passwordHash` | **accepté** |
| `({ ...row, following: true })` | **accepté** |

Le seul chemin par lequel une donnée non prévue atteint réellement le client est
donc exactement celui que le compilateur ne voit pas : le **spread** d'une ligne
de persistance. C'est la forme que F2 avait écartée à la main, par discipline —
et une discipline ne se vérifie pas en la déclarant (REQ-ARCH-001 dit déjà cela
de la frontière typée).

Deux autres faits mesurés cadrent la décision :

1. **Les assertions sont posées à la main, une par une.** L'application monte
   **20 routes** ; douze portent une assertion de contrat. Rien n'oblige la
   vingt-et-unième à en recevoir une, et son absence ne se verrait nulle part.
2. **Le front ne parse rien à l'exécution.** `apps/web/src/lib/api-client.ts`
   transtype le JSON reçu vers le type partagé. La confiance dans le fil y est
   totale, et n'est éprouvée par aucun test contre une réponse réelle.

L'énumération des routes montées et la vue d'un intercepteur ont été sondées
avant de choisir, sur l'application réelle (NestJS 11, Express 5) :
`app.getHttpAdapter().getInstance().router.stack` rend les 20 routes avec leur
**motif** (`/api/articles/:slug/comments/:id`), et un intercepteur global lit ce
même motif dans `req.route.path` — donc `méthode + motif` est une clé stable,
identique des deux côtés.

## Options Considered

### Axe 1 — où vit la propriété « aucun champ en trop »

| Option | Trade-off |
|---|---|
| **A — Assertion de test symétrique (retenue)** | `expect(schema.parse(body)).toEqual(body)`. Le second membre **est** la preuve d'absence de clé inconnue : le parse retire les intrus, donc l'égalité ne tient que si le corps n'en portait pas. Une ligne, aucun schéma nouveau, aucune dépendance. Le contrat reste permissif à l'exécution, donc un front déployé continue de lire une API qui a gagné un champ — la compatibilité ascendante est préservée là où elle compte. |
| B — `.strict()` sur les schémas de réponse de `shared` | La propriété passe dans le contrat lui-même, lisible d'un coup d'œil. Écartée : elle rendrait **tout** consommateur intolérant, y compris un front déjà déployé face à une API plus récente. On achèterait la rigueur contre la compatibilité ascendante, sur un contrat que la spec RealWorld nous impose et que nous ne versionnons pas. |
| C — Variantes strictes dérivées (`…SchemaStrict`), réservées aux tests | Aucune perte de compatibilité, propriété exprimée dans le contrat. Écartée : douze exports de plus à garder alignés, soit **une seconde description du même modèle** — exactement ce que la thèse du dépôt refuse ailleurs (`packages/shared` écrit le modèle une fois). |
| D — Parse à l'exécution dans le front, fail-closed | Transforme la garantie en propriété de production. Écartée pour l'instant : une API légèrement en avance ferait tomber l'écran, et il faudrait décider ce que l'utilisateur voit à ce moment-là — une décision de produit, pas d'outillage. Reste ouverte si le front venait à consommer une API qu'il ne compile pas avec lui. |

### Axe 2 — comment garantir qu'une route future n'échappe pas au contrat

| Option | Trade-off |
|---|---|
| **E — Intercepteur de contrat dans le harnais de test (retenue)** | Un intercepteur monté par la lane d'intégration confronte **toute** réponse qui transite au schéma de sa route. Les tests existants deviennent des tests de contrat sans qu'aucun ne soit réécrit, et l'oubli devient impossible plutôt qu'improbable. Coût : un registre route → schéma à tenir, et un intercepteur qui n'existe que pour les tests. |
| F — Assertions au fil des specs + script de comptage | Moins de machinerie. Écartée : le contrôle porterait sur le **nommage** des specs, pas sur ce qui transite réellement. Le dépôt a déjà payé cette confusion en E3, où un `grep` rendait un « ok » qui ne mesurait rien. |
| G — Rester ad hoc | Ajouter l'assertion symétrique aux douze endroits, sans mécanisme de complétude. Écartée : une route ajoutée en Phase 5 n'aurait aucune assertion, et c'est précisément l'angle mort que cet item doit fermer. |

### Axe 3 — la moitié « types vérifiés à la compilation »

| Option | Trade-off |
|---|---|
| **H — Test négatif sur le chemin réel (retenue)** | On retire un champ du contrat de la **projection réelle** qui construit la réponse, et l'on constate que `tsc` refuse. Cela prouve que le chemin de construction est réellement typé, et non transtypé par un `as` ou érodé par un `any` — propriété du dépôt, pas de TypeScript. |
| I — `expectTypeOf` restatant la forme attendue | Lisible, sans dépendance nouvelle (Vitest le fournit). Écartée : chaque assertion réécrirait à la main la forme que le schéma définit déjà. Deux descriptions du même modèle, qui divergeront — le défaut que l'option C porte aussi. |
| J — Rien de plus | REQ-ARCH-001 prouve déjà qu'un changement dans `shared` casse les deux applications. Écartée : cette exigence prouve que le contrat **se propage**, pas que le producteur de la réponse y est réellement lié. |

## Decision

Le contrat HTTP est éprouvé par un **harnais**, en quatre pièces qui se tiennent :

1. **Assertion symétrique.** `expectMatchesContract(schema, body)` exige que
   `schema.parse(body)` réussisse **et** que le résultat soit égal au corps reçu.
   La première moitié refuse un champ manquant ou mal typé, la seconde un champ
   en trop. C'est la même ligne qui porte les deux directions.

2. **Registre de routes.** `méthode + motif` → schéma de réponse, ou marqueur
   explicite : `NO_BODY` pour les 204, `OUT_OF_CONTRACT` pour ce qui ne relève pas
   du contrat Conduit (la sonde `/health`). Le marqueur est une **décision
   écrite**, pas une omission : une route absente du registre échoue.

3. **Intercepteur de harnais.** Monté par la lane d'intégration, il confronte
   chaque réponse de succès au schéma de sa route. Aucune spec n'a d'assertion à
   écrire, et une réponse hors contrat fait rougir le test qui l'a provoquée.
   Il est doublé d'un contrôle **au démarrage** qui compare le registre aux routes
   réellement montées : sans lui, une route qu'aucun test n'exerce échapperait à
   tout, puisque l'intercepteur ne voit que ce qui passe.

4. **Test négatif de compilation.** `scripts/verify-contract-types.sh` retire un
   champ du contrat de la projection réelle et exige que le typecheck de
   `apps/api` échoue, puis restaure le dépôt — `trap` compris, sur le modèle de
   `verify-type-boundary.sh` (F6).

Les deux dernières pièces couvrent les deux moitiés d'une même asymétrie, celle
que la mesure ci-dessus a établie : **le compilateur voit le champ manquant, le
harnais voit le champ en trop.** Ni l'un ni l'autre ne suffit, et c'est pourquoi
l'item C3 parle de runtime *et* de compilation plutôt que de l'un des deux.

Le harnais est lui-même éprouvé dans la lane unit : on lui soumet un corps
porteur d'une clé en trop, un corps amputé, un 204 devenu bavard et une route
inconnue, et l'on constate qu'il refuse les quatre. Sans ce contrôle du contrôle,
un harnais qui rendrait toujours « conforme » afficherait du vert partout — le
dépôt a déjà attrapé un faux `ok` de ce genre sur un `grep` (E3) et un plugin
Biome mort à code de sortie 0 (ADR 024).

Côté front, la vérification reste **en test**, sans rien changer au chemin de
production. Sa forme exacte a changé à l'épreuve : voir le second temps ci-dessous.

### Second temps — 2026-08-08 : la capture de réponses réelles, écartée à l'épreuve

Cette décision annonçait d'abord « des fixtures capturées depuis les réponses
réelles de l'API, rejouées contre les schémas partagés dans la lane web ».
L'implémentation a rendu une mesure qui la disqualifie.

Une vraie réponse n'est jamais deux fois la même. Elle porte un **jeton signé**
(différent à chaque signature), deux **horodatages**, et un **identifiant de
commentaire** qui monte : la purge de la lane d'intégration passe par
`deleteMany`, qui ne réinitialise pas la séquence PostgreSQL — donc le compteur
repart à 1 sur la base neuve d'un runner CI et continue de grimper sur le poste
d'un développeur. Une fixture committée serait différente à chaque exécution, et
le contrôle de dérive censé la garder honnête rougirait en permanence sans jamais
signaler quoi que ce soit de réel.

La stabiliser demanderait de **nommer les champs volatils** quelque part. C'est
exactement la forme que les options C et I ci-dessus écartent : une seconde
description du modèle, à tenir alignée sur les schémas Zod, qui divergera. Tenir
la promesse aurait donc coûté le principe au nom duquel les deux autres options
avaient été refusées.

Ce qui est livré à la place couvre le trou réellement nommé dans le contexte —
« le front ne parse rien à l'exécution » — sans fixture capturée : **le déballage
de l'enveloppe ne perd ni n'invente de champ**, vérifié pour chacune des dix-sept
méthodes du client qui rendent une valeur, avec la même assertion symétrique que
côté API. Le contrôle de complétude compare les **noms** des méthodes couvertes à
ceux du client réel, sur le modèle du registre de routes.

Une leçon en est sortie, qui vaut au-delà de ce cas. Le premier écrit de cette
spec servait `username: 'jake'` ; un sabotage ajoutant `.toLowerCase()` au
déballage du profil ne la faisait **pas** rougir. Une valeur déjà normalisée ne
peut pas révéler une normalisation. Les fixtures portent désormais une casse
mélangée, un espace final et des listes en désordre — chaque forme visant un
geste précis (`toLowerCase`, `trim`, `sort`, `?? ''`).

Ce que cela laisse ouvert, écrit plutôt que passé sous silence : les fixtures web
restent **écrites à la main**, donc rien ne garantit qu'elles ressemblent à ce
que l'API envoie vraiment. C'est la question que la capture devait fermer, et
elle reste ouverte.

Elle est suivie en **issue #37** plutôt que laissée ici seule : un manque qui ne
vit que dans un ADR n'est pas un travail que quelqu'un retrouvera — personne ne
relit une décision pour y chercher ce qu'il reste à faire. L'issue porte les deux
formes envisageables (normaliseur aveugle au modèle, ou contrat de forme plutôt
que de valeur) et son déclencheur : le jour où une fixture web se révélera
fausse, l'instruction sera déjà faite.

### Ce que ce harnais ne voit pas, écrit ici plutôt que découvert plus tard

- **Les réponses d'erreur.** Mesuré : une 422 levée par le pipe de validation et
  une 404 de route inconnue **ne traversent pas** l'intercepteur — elles partent
  par le chemin d'exception, que le filtre traite ensuite. Le contrat d'erreur
  (PRD §10) reste donc couvert par les assertions existantes et par la suite Hurl,
  pas par ce harnais. Étendre l'intercepteur aux erreurs demanderait de se
  brancher après le filtre, ce qui est un autre point de couture ; ce n'est pas
  fait, et c'est écrit.
- **La production.** L'intercepteur n'est monté que par les tests. Une réponse
  fabriquée par un chemin qu'aucun test n'emprunte reste invisible. Le contrôle
  de complétude au démarrage réduit cet angle aux **branches** d'une route
  couverte, pas aux routes elles-mêmes.
- **Un champ légitimement absent.** Le contrat Conduit n'a pas de champ optionnel
  au sens « parfois présent » ; le jour où il en aurait un, l'égalité symétrique
  demanderait une normalisation explicite, pas un assouplissement du principe.

## Consequences

### Positive

- La direction du contrat qui compte pour la sécurité — aucune donnée non prévue
  ne sort — devient une propriété **observée**, alors qu'elle était jusqu'ici
  seulement crue, avec douze assertions qui donnaient l'impression contraire.
- Le coût marginal d'un endpoint futur est d'une ligne de registre. Le contrat
  n'est plus quelque chose qu'on pense à vérifier, mais quelque chose qu'on doit
  délibérément déclarer hors contrat pour y échapper.
- Les tests d'intégration existants gagnent une seconde propriété sans être
  touchés : chacun devient, en plus de ce qu'il testait, un test de contrat.

### Negative

- Le registre est une **duplication déclarative** : il redit, en un endroit,
  quelle route rend quelle enveloppe. Une route renommée sans mise à jour du
  registre fait rougir le contrôle de complétude — c'est le comportement voulu,
  mais c'est un fichier de plus à tenir.
- L'intercepteur n'existe que pour les tests. Un lecteur pressé pourrait croire
  que la validation de sortie tourne en production ; l'entête du fichier et cet
  ADR sont les seuls endroits qui disent le contraire.
- La couverture des réponses d'erreur reste inchangée, alors que le titre « tests
  de contrat » laisserait supposer qu'elle est incluse.

### Neutral

- Aucune dépendance nouvelle : Zod, Vitest et NestJS fournissent tout. Le coût
  d'exécution est celui d'un `parse` par réponse, dans une lane déjà dominée par
  les allers-retours vers PostgreSQL.
- Les douze assertions manuelles existantes deviennent redondantes avec
  l'intercepteur. Elles sont conservées : elles nomment le schéma attendu à
  l'endroit du test, ce qui reste lisible, et leur suppression n'apporterait rien
  qu'un diff.
- L'option D (parse à l'exécution côté front) n'est pas refusée sur le fond,
  seulement différée.
