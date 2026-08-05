# ADR 017 — Les messages d'erreur du contrat vivent dans `packages/shared`

## Status

Accepted — 2026-08-05. Amende [004 — Persistance alignée sur le contrat](004-persistance-alignee-sur-le-contrat.md)
sur un point : la normalisation d'un champ nullable vide est décidée par le
contrat partagé, pas par la couche de persistance.

## Context

La première exécution de la suite de conformité officielle (ADR 016) contre
`apps/api` a produit 29 assertions en échec. Aucune ne portait
sur un parcours métier : `articles`, `comments`, `favorites`, `feed`,
`pagination`, `profiles` et `tags` passaient intégralement. **Toutes** portaient
sur la forme des erreurs.

Elles se ramènent à cinq causes, et chacune dit la même chose sous un angle
différent :

1. Les messages par défaut de Zod partaient au client tels quels
   (`"Too small: expected string to have >=1 characters"` là où le contrat
   attend `"can't be blank"`). Le contrat d'erreur était donc, de fait, celui de
   notre bibliothèque de validation.
2. Le refus d'authentification employait la clé `authorization` là où le contrat
   emploie `token`.
3. Le refus d'identifiants employait la clé `email or password` là où le contrat
   emploie `credentials`.
4. Les messages de permission (`"is not yours to modify"`,
   `"is not yours to delete"`) étaient les nôtres ; le contrat dit `"forbidden"`
   pour les deux.
5. `bio` et `image` mis à la chaîne vide étaient persistés tels quels ; le
   contrat les normalise en `null`.

Le point commun mérite d'être nommé, parce qu'il est plus intéressant que
chacune des cinq lignes. Les commentaires de `apps/api/src/domain/user/user.errors.ts`
affirmaient que ces messages étaient « repris **verbatim** de l'implémentation
de référence RealWorld et des exemples d'`openapi.yml` ». C'était écrit de bonne
foi et c'était faux : les exemples d'un fichier OpenAPI illustrent une forme, la
suite de conformité *est* le contrat (PRD §15). Personne ne pouvait le constater
tant que la suite ne tournait pas — une affirmation invérifiable avait tenu lieu
de vérification pendant deux slices.

La question posée maintenant est donc : ces chaînes, une fois corrigées, vivent
où ? Elles apparaissent aujourd'hui en littéraux à trois endroits — les classes
d'erreur du domaine (`apps/api`), les schémas Zod (`packages/shared`), et
l'affichage des formulaires (`apps/web`).

## Options Considered

| Option | Trade-off |
|---|---|
| **A — Table nommée dans `packages/shared` (retenue)** | Une seule définition, consommée par les erreurs de domaine, les schémas Zod et le front. Cohérent avec la thèse du dépôt : `shared` est la source de vérité unique du contrat, et un message de contrat *est* du contrat. Coût : une indirection de plus à la lecture d'une classe d'erreur. |
| B — Littéraux corrigés sur place | Diff minimal, aucune abstraction nouvelle, chaque classe d'erreur se lit d'un bloc. Écarté : c'est l'état actuel, et il vient précisément de produire cinq divergences. Le même message existerait à deux endroits (API et web) sans que rien ne rappelle qu'ils doivent coïncider. |
| C — Messages dérivés de la suite Hurl | Extraire les chaînes attendues des fichiers `.hurl` à la génération. Écarté : cela ferait dépendre le code de production du format d'un fichier de test tiers, et rendrait le dépôt incapable de compiler si l'amont changeait sa syntaxe. La suite doit *vérifier* la conformité, pas la *produire*. |

## Decision

`packages/shared/src/errors/contract-messages.ts` porte les chaînes du contrat
en constantes nommées, avec pour chacune le fichier de la suite officielle qui
l'exige. C'est la référence citée qui fait la valeur de la table : elle
transforme « on pense que le message est celui-ci » en « voici l'assertion qui
le dit ».

Elle est consommée par :

- les schémas Zod de `packages/shared` — un champ requis produit `"can't be
  blank"`, et jamais le message par défaut de Zod ;
- les classes d'erreur de `apps/api/src/domain/**` — le corps §10 vient de la
  table, la classe ne décide plus du texte ;
- `apps/web`, qui affiche déjà ces messages sous les champs de formulaire sans
  les réécrire.

Deux corollaires suivent, et méritent d'être écrits parce qu'ils ne se déduisent
pas de la table :

**Le refus d'authentification distingue l'absence de la présence invalide.** Le
contrat exige `token: ["is missing"]` quand aucun en-tête `Authorization` n'est
exploitable. Un jeton présent mais invalide, expiré, ou dont le sujet ne résout
plus vers un compte reçoit `token: ["is invalid"]` — **un seul** message pour
ces trois causes. La propriété que défendait l'indistinction d'origine est
préservée là où elle compte : rien ne renseigne le porteur sur *l'état* de son
jeton. Savoir s'il en a envoyé un, en revanche, il le sait déjà.

**Un champ nullable reçu vide est une absence, pas une valeur.** `bio: ""` et
`image: ""` sont normalisés en `null` par le schéma partagé, donc avant que le
domaine ne les voie. C'est la règle que `apps/web` appliquait déjà à l'effacement
d'un champ (slice F4b) ; elle remonte ici au seul endroit d'où elle vaut pour les
deux applications.

## Consequences

### Positive

- Le contrat d'erreur cesse d'être un effet de bord de la bibliothèque de
  validation : changer de bibliothèque ne change plus ce que voit un client.
- Chaque message porte en commentaire l'assertion officielle qui l'exige, donc
  une divergence future se diagnostique en lisant un seul fichier.
- `apps/web` peut afficher un message de validation sans le recopier, ce qui
  ferme la dernière divergence possible entre le message du serveur et celui du
  formulaire.
- La normalisation du vide est appliquée une fois, à la frontière, plutôt que
  répétée dans chaque use-case qui touche un champ nullable.

### Negative

- Lire une classe d'erreur du domaine demande maintenant d'ouvrir un second
  fichier pour connaître le texte renvoyé.
- La table fige des chaînes anglaises dans le code d'un dépôt commenté en
  français. C'est assumé : ce sont des valeurs de protocole, pas de la langue —
  au même titre qu'un en-tête HTTP.
- Une internationalisation des messages, si elle devenait un besoin, devrait
  traiter cette table comme la clé et non comme le texte. Rien n'est prévu pour
  ça aujourd'hui.

### Neutral

- Les messages `Error` internes des classes de domaine (ceux qui partent dans
  les traces) restent libres et distincts des messages de contrat : ils
  s'adressent à un opérateur, pas à un client.
- La table couvre les messages que la suite officielle **assert**. Ceux qu'elle
  ne vérifie pas (le motif d'un email malformé non vide, par exemple) restent
  choisis par nous, et l'ADR ne prétend pas qu'ils soient contractuels.
