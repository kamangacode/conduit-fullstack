# Contributeurs

Ce dépôt est une **preuve de craft**. Il se doit donc d'être exact sur sa propre
fabrication : dire qui a fait quoi fait partie de ce qu'il démontre.

## Auteur

**kamangacode** — conception, arbitrage des décisions d'architecture, et
responsabilité de ce qui entre dans l'historique. Chaque ADR, chaque seuil, chaque
garde-fou posé ou écarté relève d'un choix assumé ici.

## Contribution assistée

**Claude (Anthropic)** — implémentation en pair : écriture de code et de tests,
outillage de CI, rédaction des exigences et des ADR sous arbitrage humain.

Crédité par le trailer standard sur les commits concernés :

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Une précision sur les dates, parce qu'elle change la lecture

Le trailer apparaît **à partir du 2026-08-12**, date à laquelle la convention
d'attribution du dépôt a changé. Le **mode de fabrication, lui, est antérieur** :
une partie substantielle du travail qui précède cette date a été produite de la
même façon, sous une convention qui demandait alors de ne pas le mentionner.

Ne pas le dire ici reviendrait à laisser croire que seule la fin du projet a été
assistée. Réécrire l'historique pour ajouter le trailer rétroactivement aurait
changé les empreintes des commits déjà publiés et cassé le tag `v0.8.0` ainsi que
sa release — un coût réel pour une exactitude que cette page suffit à établir.

## Ce que le crédit ne dit pas

Un `Co-Authored-By` signale une contribution, **pas une caution**. Les garde-fous
du dépôt restent la condition d'entrée d'un changement, qu'il ait été écrit à deux
mains ou à quatre :

- une règle qu'aucun harnais ne met en échec n'est pas considérée comme posée ;
- un seuil se calibre sur une mesure réelle avant de devenir bloquant ;
- un critère d'acceptation doit pouvoir échouer pour valoir quelque chose.

C'est cette discipline qui décide de la qualité du dépôt, pas l'identité de qui a
tapé la première version d'une ligne.

## Automatisation

**github-actions[bot]** — commits de release produits par `release-please`
(version, `CHANGELOG.md`, tag). Voir
[ADR 028](docs/adr/028-changelog-et-release-via-release-please.md).
