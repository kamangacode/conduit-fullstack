# ADR 030 — L'auto-merge arme, il ne décide pas, et n'alimente jamais `main`

## Status

Accepted — 2026-08-11. Item **D6** du plan d'outillage (Phase 6, « `auto-merge.yml`
label `reviewed` → squash »), et durcissement de la contrainte de promotion que la
rule 15 énonçait comme une consigne.

## Context

Le dépôt sait maintenant refuser un sujet non conventionnel ([ADR 029](029-sujet-conventionnel-verrou-partage.md))
et dériver sa release de l'historique de `main` ([ADR 028](028-changelog-et-release-via-release-please.md)).
Il lui manque la marche qui relie les deux : fusionner une PR relue sans attendre
qu'un humain repasse cliquer quand la CI vire au vert.

Deux questions se posent, et elles n'ont pas le même poids.

La première est mécanique : **qui décide que la CI est verte ?** GitHub sait déjà
le faire — la protection de branche connaît ses checks requis, et l'auto-merge
natif attend qu'ils passent. Un workflow peut néanmoins prétendre le refaire.

La seconde est un risque déjà identifié et non couvert. La rule 15 impose que la
promotion `staging → main` soit un **merge commit, jamais un squash** : un squash
aplatit les N commits conventionnels de `staging` en un seul, et release-please
**saute la release** — pas de bump, pas de changelog, `main` qui diverge en
silence. La rule s'en remettait à une consigne : « ne pas poser le label
`reviewed` sur la PR de promotion ». Or une consigne tient jusqu'au jour où
quelqu'un labellise par habitude, et **le symptôme n'apparaît pas au moment du
geste** : rien ne casse, une release manque, et personne ne le voit avant le
changelog suivant.

## Options Considered

| Option | Trade-off |
|---|---|
| **Armer l'auto-merge natif, règle d'éligibilité dans un script (retenue)** | Le workflow pose un drapeau (`gh pr merge --auto --squash`) ; **GitHub** attend les checks requis. La seule décision propre au dépôt — « cette PR a-t-elle le droit d'être fusionnée automatiquement ? » — vit dans `scripts/check-auto-merge-eligibility.sh`, donc dans un fichier qu'on peut mettre en échec. Coût : dépend du réglage `allow_auto_merge` du dépôt, et la protection de branche doit exiger `ci-success`. |
| Le workflow fusionne lui-même quand `ci-success` est vert | Tentant : pas de réglage de dépôt à activer. Écartée — le workflow devrait maintenir **sa propre liste de checks requis**, et se tromperait le jour où un check est ajouté sans qu'on pense à l'y recopier ; il fusionnerait alors une PR dont un contrôle n'a pas encore parlé. Le dépôt a déjà payé une variante exacte de cette erreur : `ci-success` a annoncé vert un run où cinq jobs requis n'avaient jamais démarré (run 31127768013). Retrancher une décision que la plateforme prend mieux est une régression, pas une simplification. |
| Condition d'éligibilité écrite en YAML (`if: github.event.pull_request.base.ref != 'main' && …`) | Le plus court. Écartée : une condition YAML **ne peut pas être mise en échec**. On ne peut ni lui soumettre une promotion labellisée pour constater le refus, ni prouver qu'un contrôle négatif la distingue d'une condition absente. Sur la propriété la plus coûteuse à perdre du dépôt, c'est le mauvais endroit pour faire confiance. |
| Interdire le label sur la PR de promotion (statu quo de la rule 15) | Zéro code. Écartée : c'est la consigne qui existait déjà et dont on cherche justement à ne plus dépendre. |

## Decision

Écrire la règle d'éligibilité **une fois**, dans
`scripts/check-auto-merge-eligibility.sh`, et donner au workflow le rôle
strictement minimal d'armer.

- **`.github/workflows/auto-merge.yml`** — déclenché sur `pull_request_target`
  `types: [labeled]`. Il appelle la règle, puis `gh pr merge --auto --squash`.
  `--auto` est le mot décisif : sans lui, ce serait un merge immédiat.
- **La règle refuse toute PR dont la base est `main`**, quel que soit son label.
  Le critère porte sur la **base**, jamais sur le nom de la branche source : une
  règle écrite sur `head == staging` laisserait passer une PR ouverte vers `main`
  depuis n'importe quelle autre branche. Le script ne reçoit d'ailleurs pas la
  branche source, ce qui est la façon la plus sûre de garantir qu'il n'en dépend pas.
- La règle refuse aussi les brouillons et tout label autre que `reviewed` — sans
  traiter ces refus comme des pannes : la plupart des labels ne demandent rien.
- **`scripts/verify-auto-merge-eligibility.sh`** met la règle en échec en
  pre-push et dans le job CI `Quality`, et vérifie le **câblage** : que le
  workflow appelle bien le script partagé, qu'il ne rejuge ni la base ni le
  label, et qu'il passe bien par `--auto`.

Sécurité du déclencheur : `pull_request_target` s'exécute avec les droits du
dépôt de base. Le workflow ne fait donc **aucun checkout du code de la PR** — il
récupère la base (`base.sha`) pour n'exécuter que le script de la branche cible,
jamais une version réécrite par l'auteur de la PR — et le nom de label transite
par une variable d'environnement plutôt que par une interpolation `${{ }}` dans
un `run`.

Deux **gestes humains** restent nécessaires et sont assumés comme tels :
activer `allow_auto_merge` sur le dépôt (à `false` aujourd'hui, ce qui rend le
workflow inerte plutôt que surprenant), et exiger `ci-success` dans la protection
de branche de `staging` — sans quoi « auto-merge » signifierait « merge immédiat ».

## Consequences

### Positive

- La contrainte la plus coûteuse du dépôt — ne jamais squasher une promotion —
  cesse d'être une consigne et devient une propriété du mécanisme, éprouvée à
  chaque push.
- Aucune liste de checks requis n'est dupliquée : la protection de branche reste
  la seule source, et l'ajout d'un check futur est automatiquement pris en compte.
- La règle est un script appelable à la main, donc lisible et diagnosticable
  quand une PR n'est pas armée sans raison apparente.
- Le workflow est inerte tant que le réglage du dépôt n'est pas activé : la mise
  en service est un geste délibéré, pas un effet de bord du merge de cette PR.

### Negative

- Deux réglages hors dépôt conditionnent le fonctionnement, et rien dans le code
  ne peut les vérifier ; leur absence se manifeste par un job qui échoue en le
  disant, pas par un comportement dégradé silencieux.
- `pull_request_target` demande de la discipline à chaque évolution de ce
  fichier : y ajouter un checkout du code de la PR y réintroduirait une faille
  connue. Le commentaire d'en-tête porte cet avertissement.
- Un label posé sur une PR de travail déclenche une fusion sans nouvelle
  intervention humaine. C'est l'objet de l'item, mais cela déplace la
  responsabilité sur la pose du label.

### Neutral

- Les branches ne sont pas supprimées après fusion : le dépôt conserve ses
  branches d'issue, et le nettoyage reste une étape distincte du workflow de
  développement.
- Le label `reviewed` est créé dans le dépôt à l'occasion de cet item ; il ne
  porte aucune sémantique au-delà de « prêt à fusionner quand la CI le permet ».
