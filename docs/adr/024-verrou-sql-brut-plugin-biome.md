# ADR 024 — Verrou SQL brut : plugin GritQL Biome, plutôt qu'un second linter

## Status

Accepted — 2026-08-07. Écart assumé au plan d'outillage, qui prescrivait
`eslint.config.mjs` pour cet item (B6).

## Context

La `rule 19` (cadre local, non publié — voir la note en fin d'[index](README.md))
interdit `$queryRawUnsafe` et
`$executeRawUnsafe`, et demande de le faire respecter « par une règle de lint
(`no-restricted-syntax` ou équivalent) plutôt que par la seule revue humaine ».
Cette formulation date d'un moment où le dépôt n'avait pas encore choisi son
outillage ; elle nomme une règle ESLint parce que c'est l'exemple canonique, pas
parce qu'ESLint est ici.

Le risque, lui, est réel et précis. Les deux méthodes prennent une **chaîne**
construite par l'appelant, là où leurs jumelles `$queryRaw` et `$executeRaw` sont
des tagged templates qui lient leurs valeurs. Quatre caractères séparent donc la
forme sûre de l'injection SQL, dans deux identifiants qui se ressemblent à s'y
méprendre en revue. C'est exactement le type de faute qu'un outil attrape mieux
qu'un humain.

Le dépôt n'a **qu'un** linter : Biome 2.5.7, en `error` bloquant, branché en
pre-commit, en pre-push et dans le job CI `Quality`. Aucun ESLint, aucune de ses
dépendances. La question n'est donc pas « quelle règle écrire » mais « avec quoi
l'écrire, sans acheter une seconde chaîne d'outillage pour une seule règle ».

Trois faits mesurés pendant l'instruction de cet ADR, qui l'ont tranché plus
sûrement que le raisonnement :

1. **Biome 2 exécute des plugins GritQL** déclarés dans `biome.json`, et
   `register_diagnostic` y produit un diagnostic de sévérité `error` qui fait
   sortir la commande en non nul. Vérifié sur fixture avant d'écrire quoi que ce
   soit.
2. **Le motif évident ne suffit pas.** `$obj.$method($args)` avec un test sur
   `$method` laisse passer `client?.$queryRawUnsafe(sql)` — le chaînage optionnel
   est un autre nœud d'AST — et l'alternative `or { … }` entre deux snippets ne
   compile pas (« cannot create resolved snippet from unresolved variable »).
   Tester le **callee entier** couvre les trois formes réelles d'un seul motif.
3. **Un plugin GritQL en erreur se dégrade en silence.** Un groupe capturant de
   trop dans la regex, et Biome rapporte « regex pattern matched 1 variables, but
   expected 0 » **en `info`, avec un code de sortie 0**. Le lint reste vert, le
   verrou ne matche plus rien, et rien ne le dit. Constaté, pas supposé.

Le troisième point pèse plus que le choix d'outil : il vaut pour n'importe quelle
implémentation, et c'est lui qui décide qu'un verrou déclaré ne suffit pas.

## Options Considered

| Option | Trade-off |
|---|---|
| **A — Plugin GritQL dans Biome (retenue)** | Un seul linter dans le dépôt, aucune dépendance nouvelle, aucun job CI de plus : le verrou hérite des trois points de contrôle existants (pre-commit, pre-push, CI). Analyse d'AST, donc insensible à une mention du nom en commentaire ou en chaîne. Coût : GritQL est jeune et peu documenté, ses messages d'erreur sont laconiques, et son mode d'échec par défaut est silencieux — d'où la vérification active obligatoire. |
| B — Ajouter ESLint pour cette règle (lettre du plan) | Suit le plan sans discussion, et `no-restricted-syntax` est un chemin connu. Écartée : une seconde chaîne de lint à installer, configurer, faire tourner en CI et maintenir en version, pour **une** règle. Surtout, deux sources de vérité sur ce qui est interdit — le jour où elles divergent, c'est la plus silencieuse qui gagne. |
| C — Script de garde textuel (`grep`), sur le modèle de B2 | Cohérent avec `secret-guard.sh`, trivial à écrire et à éprouver. Écartée sur **preuve** : le `grep` signale le mot dans un commentaire (`// interdit : $queryRawUnsafe`), dans une chaîne, et dans un nom voisin comme `$queryRawUnsafeWrapper`. Trois faux positifs sur une seule fixture — et un verrou qui crie à tort se fait contourner, puis désactiver. |
| D — Ne rien automatiser, s'en remettre à la revue | Coût nul. Écartée : c'est l'état que la rule 19 nomme explicitement comme insuffisant, et la ressemblance des deux paires d'identifiants est précisément ce qu'une revue laisse passer un vendredi soir. |

## Decision

Le verrou est un plugin GritQL, [`biome-plugins/no-prisma-raw-unsafe.grit`](../../biome-plugins/no-prisma-raw-unsafe.grit),
déclaré dans le champ `plugins` de `biome.json`. Il hérite donc de tous les
points où Biome tourne déjà, sans en ajouter un seul.

Le motif porte sur le **callee entier** de l'appel, comparé à une regex ancrée
(`[\s\S]*\$(?:queryRawUnsafe|executeRawUnsafe)`). Ce détail d'écriture porte deux
propriétés qui ne sont pas des détails :

- il couvre `prisma.$queryRawUnsafe(…)`, `this.prisma.$executeRawUnsafe(…)` **et**
  `client?.$queryRawUnsafe(…)` — trois nœuds d'AST distincts, un seul motif ;
- l'ancrage rend la comparaison **exacte** : `$queryRawUnsafeWrapper` n'est pas
  signalé, et le groupe non capturant évite l'erreur silencieuse décrite plus
  haut.

**Le verrou n'est pas considéré en place parce qu'il est déclaré.**
[`scripts/verify-sql-raw-guard.sh`](../../scripts/verify-sql-raw-guard.sh) soumet
au **vrai `biome.json`** neuf fixtures écrites hors du dépôt : quatre qui doivent
être refusées, quatre qui doivent passer, et un contrôle du contrôle qui rejoue
la fixture interdite contre une config privée de son plugin. Sans cette dernière
phase, un harnais qui rapporterait « refusé » pour une raison étrangère — une
fixture mal formatée, une règle voisine — afficherait « ok » partout. Le script
exige donc un code de sortie non nul **et** le diagnostic du plugin dans la
sortie.

La rule 19 est amendée en conséquence : elle nommait `no-restricted-syntax`, elle
nomme désormais le mécanisme réel.

### Ce que ce verrou ne voit pas, écrit ici plutôt que découvert plus tard

Un alias sort la méthode de son receveur avant l'appel :

```ts
const run = prisma.$queryRawUnsafe
run(sql)
```

Le callee est alors `run`, et aucune analyse **syntaxique** ne peut le rattacher à
Prisma — il y faudrait les types. Le trou est assumé : ce verrou protège du geste
distrait, pas du contournement délibéré, qui disposerait de toute façon de
`biome-ignore`. La revue garde l'intention, l'outil prend l'accident. Prétendre
l'inverse donnerait une fausse assurance, qui est le seul défaut plus coûteux
qu'une absence de verrou.

## Consequences

### Positive

- Le dépôt reste à **un** linter, et l'interdiction la plus sévère de la rule 19
  s'applique partout où Biome tourne déjà — y compris dans l'éditeur, avant même
  le commit.
- L'analyse est syntaxique : elle voit un appel, pas une occurrence de chaîne.
  Les trois faux positifs qui ont écarté l'option textuelle sont vérifiés comme
  tels dans le harnais, donc ils resteront vrais.
- Le dépôt gagne un précédent lisible pour toute interdiction future portant sur
  une **forme de code** plutôt que sur un fichier : un `.grit`, un motif, une
  vérification active.

### Negative

- GritQL est jeune. Sa documentation est mince, ses diagnostics d'erreur sont
  courts, et deux formulations naturelles du motif se sont révélées inutilisables
  avant d'en trouver une qui tienne. Un contributeur qui voudra ajouter une règle
  paiera cette exploration à son tour — d'où l'entête détaillé du fichier `.grit`.
- Le mode d'échec par défaut d'un plugin est le **silence vert**. Le verrou est
  donc solidaire de sa vérification : supprimer `verify-sql-raw-guard.sh`
  reviendrait à supprimer le verrou, sans que rien ne rougisse. Le lien est écrit
  dans REQ-SEC-002 et dans l'entête des deux fichiers.
- L'écart au plan d'outillage devra être relu par quiconque compare le plan au
  dépôt. Cet ADR est la réponse à cette question ; le plan y renvoie.

### Neutral

- Le fichier `.grit` est formaté par Biome lui-même, qui traite ce langage. Une
  ligne longue dans `register_diagnostic` est donc son choix, pas le nôtre.
- Aucun appel interdit n'existe aujourd'hui dans `apps/api`. Ce verrou est
  **préventif** : il ne corrige rien, il ferme une porte avant que quelqu'un la
  pousse. C'est ce qui rend sa vérification active indispensable — un verrou qui
  n'a jamais rien refusé ne se distingue pas d'un verrou qui ne fonctionne plus.
