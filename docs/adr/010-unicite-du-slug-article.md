# ADR 010 — Unicité du slug d'article : suffixe incrémental résolu par la contrainte

## Status

Accepted — 2026-08-05.

## Context

La règle **R-1** du PRD (§11) fait du `slug` l'identifiant public de l'article et
le dérive du titre. Les trois endpoints d'accès unitaire (`GET`, `PUT`, `DELETE
/api/articles/:slug`), ainsi que les commentaires et les favoris qui s'y
rattachent, l'utilisent comme clé d'adressage : deux articles ne peuvent pas
partager un slug sans rendre ces routes ambiguës.

Or rien n'interdit deux titres identiques. La spec de référence est explicite sur
ce point et laisse la mécanique ouverte :

> *The `slug` is the article's URL identifier. The spec only requires it to be a
> unique string that you can use to fetch, update, and delete the article —
> duplicate titles must still produce distinct slugs. How you derive it is up to
> your implementation.*
> — `specifications/backend/endpoints.md`

Deux contraintes encadrent donc la décision : le slug doit être **unique**, et
refuser la création sur titre dupliqué n'est **pas** une option conforme (la spec
exige que la création aboutisse avec un slug distinct).

S'ajoute une contrainte de concurrence. La démarche spontanée — « vérifier si le
slug existe, sinon insérer » — est un TOCTOU : entre le `SELECT` et l'`INSERT`,
une seconde requête peut lire la même absence et insérer le même slug. La fenêtre
est étroite mais réelle, et elle produit soit une erreur 500 non expliquée, soit
un doublon selon que la contrainte existe ou non en base.

La décision est nécessaire avant l'écriture du domaine `article` (slice F3) :
elle détermine la signature du value object `Slug` et le contrat du repository.

## Options Considered

| Option | Trade-off |
|---|---|
| **A. Suffixe incrémental résolu par la contrainte d'unicité (retenue)** | `mon-titre`, puis `mon-titre-2`, `mon-titre-3`. Aucun `SELECT` préalable : on tente l'insertion et on ré-essaie sur violation de la contrainte unique. Slug lisible dans le cas nominal comme en collision, résolution déterministe donc testable sans injecter d'aléa. Coûte une boucle de tentatives dans l'adapter et un code d'erreur propriétaire à traduire (`P2002` Prisma). |
| B. Suffixe aléatoire court (nanoid) en cas de collision | Une tentative supplémentaire suffit en pratique, sans boucle. Mais le slug devient illisible dès la première collision, et tester la collision exige un port « source d'aléa » pour rester reproductible — une abstraction créée pour la testabilité seule. |
| C. Suffixe aléatoire systématique | Élimine toute branche conditionnelle et toute boucle : il n'y a plus de collision possible. Prix : **aucune** URL n'est lisible, y compris pour les articles sans homonyme, qui sont l'écrasante majorité. |
| D. Rejeter le titre dupliqué en 409 | Cohérent avec l'[ADR 009](009-conflit-unicite-409.md)… mais **non conforme** : la spec impose que la création aboutisse. Écartée sur le contrat, pas sur le goût. |

## Decision

Le slug est dérivé du titre par kebab-case (translittération ASCII, séparateurs
réduits, bornes nettoyées) dans un value object `Slug` du domaine, **pur et sans
accès au dépôt** : `Slug.fromTitle(title)` ne connaît pas les slugs déjà pris.

L'unicité est résolue au moment de la persistance, par la **contrainte
`@unique`** déjà déclarée sur `articles.slug` :

1. l'adapter tente l'insertion avec le slug candidat ;
2. sur violation de contrainte unique (`P2002` côté Prisma), il incrémente le
   suffixe (`-2`, `-3`, …) et retente ;
3. la boucle est bornée ; l'épuisement des tentatives est une erreur
   d'infrastructure, pas une erreur métier.

Aucune vérification d'existence préalable n'est faite. C'est le cœur de la
décision : **la base est l'autorité sur l'unicité**, parce qu'elle est le seul
endroit où la question « ce slug est-il libre ? » et l'acte « je le prends » sont
atomiques. Un `SELECT` préalable ne supprime pas le besoin de traiter la
violation — il ajoute une requête et une illusion de sûreté.

Le renommage suit la même mécanique : `PUT /api/articles/:slug` qui change le
`title` régénère le slug (exigé par la spec), en repassant par le même chemin.

## Consequences

### Positive

- Les URL restent lisibles dans le cas nominal, qui est le cas courant.
- La résolution est déterministe : un test qui crée deux articles homonymes peut
  asserter `mon-titre` puis `mon-titre-2` sans piloter de générateur d'aléa.
- La course concurrente est fermée par la base plutôt que par une convention de
  code, donc elle ne peut pas être rouverte par un appelant distrait.
- Le domaine reste pur : `Slug` ne connaît ni dépôt ni collision ; la résolution
  d'unicité vit dans l'adapter, là où vit la contrainte.

### Negative

- La boucle de retry vit dans l'adapter Prisma et doit traduire un code d'erreur
  propriétaire (`P2002`). C'est du couplage au moteur, assumé et localisé à
  l'endroit prévu pour ça.
- Sous forte contention sur un même titre, le nombre de tentatives croît
  linéairement. Le volume attendu ne le rend pas problématique ; si ça le
  devenait, l'option B redeviendrait pertinente et cet ADR serait amendé.
- Un article renommé change d'URL, et l'ancienne cesse de répondre. C'est le
  comportement exigé par la spec, pas un effet de bord de cette décision, mais il
  se paie ici : aucune redirection n'est prévue.

### Neutral

- Un slug terminé par un chiffre est ambigu à la lecture — `how-to-train-your-dragon-2`
  peut venir d'une collision comme du titre « How to train your dragon 2 ». Sans
  conséquence : le slug est opaque côté client, et il ne sert jamais à
  reconstituer le titre.
- La contrainte `@unique` sur `articles.slug` existe depuis la migration
  initiale ([ADR 002](002-modele-donnees-prisma.md)) : cette décision ne change
  pas le schéma, elle décide **qui** s'appuie dessus.
- Le nombre maximal de tentatives est un paramètre d'implémentation, pas une
  décision d'architecture : il est fixé dans l'adapter et commenté sur place.
