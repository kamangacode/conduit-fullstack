---
id: REQ-SEC-003
title: Scanner largement les secrets sur la plage poussée, et ne jamais confondre « rien vu » avec « rien trouvé »
type: non-functional
domain: security
status: implemented
priority: should
source: "plan outillage-craft item B3 (Cluster B — sécurité & secrets) ; rule 19 (CI : scan de secrets sur le diff) ; pendant large de REQ-SEC-001"
acceptance_criteria:
  - id: AC-1
    given: "un dépôt jetable où un secret structurellement valide a été committé"
    when: "le scan est exécuté en mode élargi sur la plage qui contient ce commit"
    then: "il rapporte le constat et nomme le détecteur — ce qui établit que le scan atteint réellement les fichiers de la plage, et non qu'il s'exécute"
  - id: AC-2
    given: "la même clé fabriquée, qui n'ouvre aucun compte"
    when: "le scan est exécuté dans son mode de production (`--only-verified`)"
    then: "il ne la rapporte pas : sans ce filtre, chaque fixture et chaque exemple de documentation entrerait au rapport, et le rapport serait abandonné en une semaine"
  - id: AC-3
    given: "une plage vide — même commit en base et en tête, cas d'une ré-exécution de job ou d'un événement mal câblé"
    when: "le scan est exécuté"
    then: "il échoue en nommant la plage vide, au lieu de rapporter un succès : un scan qui n'a rien examiné ne doit pas ressembler à un scan qui n'a rien trouvé"
  - id: AC-4
    given: "un scanner neutralisé, placé devant le vrai dans le `PATH` et sortant en 0 sans rien écrire"
    when: "le cas de détection de AC-1 est rejoué"
    then: "le harnais ne rapporte plus aucun constat, ce qui prouve qu'il conclut sur la sortie du scanner et non sur autre chose"
implementation:
  files:
    - scripts/secret-scan.sh
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-secret-scan.sh
related:
  issues: [34, 35]
  requirements:
    - REQ-SEC-001
  adrs: []
---

# REQ-SEC-003 — Scanner largement les secrets sur la plage poussée

## Contexte

[REQ-SEC-001](REQ-SEC-001.md) refuse un commit qui ajoute un secret. Elle le fait
**étroitement et sûrement** : cinq familles de motifs à haute confiance, en
pre-commit, bloquant. Elle ne voit que ce qu'on lui a décrit, et seulement dans
le diff indexé de celui qui a installé le hook.

Cette exigence est son pendant : **large, tardif, non bloquant**. Huit cents
détecteurs et, surtout, une **vérification en ligne** — le scanner appelle le
fournisseur pour savoir si la clé trouvée est vivante. C'est ce qui rend le
signal exploitable : `--only-verified` ne rapporte que des secrets réellement
utilisables, là où une détection par entropie seule noierait le lecteur.

L'ordre compte, et il explique les deux niveaux d'autorité : B2 empêche
d'écrire, B3 constate ce qui est passé quand même — par un `--no-verify`, par une
machine sans hook, ou par un motif que B2 ne connaissait pas.

## Règles

- **Rapport, pas gate** (rule 21, étape 3). La vérification dépend du réseau et
  de l'API d'un tiers ; un gate qui rougit parce qu'un fournisseur répond mal est
  un gate qu'on désactive, et il emporte alors ce qu'il protégeait. La bascule
  éventuelle est un item distinct, avec ses conditions écrites à l'avance :
  [#34](https://github.com/kamangacode/conduit-fullstack/issues/34). C'est ce
  qui a permis de faire proprement celle de l'e2e, trois semaines après l'avoir
  décidée.
- Le scan n'a **aucun filtre de chemin**. Les autres jobs se déclenchent sur un
  diff de code ; un secret entre par n'importe quel fichier, y compris ceux où on
  ne l'attend pas — c'est-à-dire ceux où on le trouve.
- La version du scanner est **épinglée**. Un outil qui suit `latest` change de
  verdict sans qu'aucun commit n'ait bougé, et la première conclusion qu'on en
  tirerait serait fausse. Contrepartie assumée : la constante vit dans un script
  shell, donc hors de portée des écosystèmes déclarés à Dependabot — elle ne
  bougera pas d'elle-même, et un scanner qui vieillit perd les détecteurs ajoutés
  depuis. Dette suivie en [#35](https://github.com/kamangacode/conduit-fullstack/issues/35).
- La valeur d'un secret trouvé n'est **jamais** réaffichée dans un journal de CI
  public : le détecteur et le fichier suffisent à agir.

## Hors périmètre

- **La preuve qu'un secret vivant serait rapporté.** Elle demanderait d'en
  committer un. Le canary prouve les deux moitiés qui la composent — le détecteur
  tire (AC-1), le filtre filtre (AC-2) — et cette limite est écrite plutôt que
  découverte le jour où elle compte.
- L'historique déjà publié. Le scan porte sur la plage poussée ; un secret entré
  avant la mise en place de ce dispositif relève d'un audit ponctuel, pas d'un
  contrôle de CI.
- La rotation des clés. Un secret vérifié est une clé vivante : la révoquer
  d'abord, la retirer de l'historique ensuite. L'ordre inverse laisse une clé
  active dans la nature.

## Couverture

Les quatre critères sont prouvés par
[`scripts/verify-secret-scan.sh`](../../../../scripts/verify-secret-scan.sh), qui
fabrique un dépôt git jetable, y recopie le **scan réel** et lui soumet un secret
planté. Le scan résout sa racine depuis sa propre position : le recopier suffit à
le faire travailler sur le bac à sable, sans lui ajouter un paramètre qui
n'existerait que pour les tests.

**Ce que l'écriture de ce canary a appris**, et qui vaut au-delà de lui : la
première fixture portait un secret de **39 caractères** là où le détecteur en
exige exactement 40. Le canary affichait « 0 constat » — et donnait donc, en
vert, l'exacte conclusion inverse de la vérité : « le scan ne voit rien » au lieu
de « la fixture n'est pas un secret ». Un canary ne se trompe pas bruyamment, il
se tait. D'où la garde de longueur qui l'ouvre désormais : un caractère de trop
ou de moins, et la vérification s'arrête au lieu de rendre un verdict qui ne
porterait sur rien.

Le même souci a produit AC-3. L'action GitHub officielle de ce scanner, sur un
push sans commit, affiche « No commits to scan » et **sort en 0** ; un job vert
peut donc n'avoir rien examiné. Le script calcule sa plage, l'affiche, et refuse
une plage vide — c'est la seule différence qui sépare un rapport d'une décoration.
