---
id: REQ-IDEM-001
title: Rendre les créations rejouables sans produire de doublon
type: non-functional
domain: idempotency
status: implemented
priority: should
source: "Plan d'outillage item C4 (proxy du paiement) ; ADR 027. Hors spec RealWorld : le PRD ne mentionne pas l'idempotence, l'en-tête est donc facultatif."
acceptance_criteria:
  - id: AC-1
    given: "une requête de création sans en-tête `Idempotency-Key`"
    when: "elle est traitée"
    then: "le comportement est strictement celui d'avant l'item — les deux suites de conformité vendorées, qui n'envoient jamais cet en-tête, restent vertes"
  - id: AC-2
    given: "une création réussie sous une clé, puis la même requête rejouée avec la même clé"
    when: "le rejeu est traité"
    then: "la réponse d'origine est resservie à l'identique — même statut, même corps — et aucune seconde ressource n'est créée"
  - id: AC-3
    given: "une clé déjà utilisée, présentée avec un corps de requête différent"
    when: "la requête est traitée"
    then: "elle est refusée en 422 au format §10, sans exécuter la création ni altérer l'enregistrement existant"
  - id: AC-4
    given: "deux requêtes concurrentes portant la même clé, la seconde partant avant que la première n'ait répondu"
    when: "elles sont traitées"
    then: "une seule ressource est créée — la requête perdante reçoit 409 si la première n'a pas encore répondu, ou la réponse rejouée si elle a répondu, mais jamais elle ne crée une seconde ressource"
  - id: AC-5
    given: "une clé déjà utilisée par un compte, présentée par un autre compte"
    when: "la requête est traitée"
    then: "elle s'exécute normalement pour ce second compte, qui ne reçoit jamais la réponse du premier"
  - id: AC-6
    given: "une requête sous une clé qui échoue (erreur métier ou technique)"
    when: "la même requête est rejouée ensuite avec la même clé"
    then: "elle s'exécute — un échec ne consomme pas la clé, sans quoi le mécanisme interdirait la reprise qu'il existe pour permettre"
  - id: AC-7
    given: "un en-tête `Idempotency-Key` vide ou plus long que la limite admise"
    when: "la requête est traitée"
    then: "elle est refusée en 422, et aucun enregistrement n'est créé"
implementation:
  files:
    - apps/api/prisma/schema.prisma
    - apps/api/src/interface/idempotency/idempotency-store.port.ts
    - apps/api/src/interface/idempotency/idempotency.interceptor.ts
    - apps/api/src/interface/idempotency/idempotent.decorator.ts
    - apps/api/src/infrastructure/persistence/prisma-idempotency.store.ts
    - apps/api/src/interface/article/article.controller.ts
    - apps/api/src/interface/article/article.module.ts
  tests:
    - apps/api/test/integration/idempotency.integration.spec.ts
    - apps/api/src/app-module.boot.spec.ts
related:
  issues: []
  requirements:
    - REQ-ARTICLE-003
    - REQ-COMMENT-002
    - REQ-ERROR-001
  adrs:
    - "027"
    - "010"
---

# REQ-IDEM-001 — Rendre les créations rejouables sans produire de doublon

## Contexte

Un double envoi de `POST /api/articles` ne produit aucune erreur. La résolution
de slug repart du slug de base et suffixe sur refus de la contrainte
([ADR 010](../../../adr/010-unicite-du-slug-article.md)) : deux
requêtes identiques créent deux articles, le second sur `mon-titre-2`. Pour un
commentaire, l'identifiant est un `autoincrement` sans unicité — deux
commentaires identiques, pas même un conflit. Les deux fois, un 201, et rien qui
distingue la seconde publication d'une publication voulue.

C'est le mode d'échec normal d'un `POST` non idempotent : double-clic, reprise
après timeout, rejeu d'un client mobile qui a perdu la réponse. L'item traite le
cas comme **proxy du paiement** — ce dépôt ne facture rien, mais « créer deux
fois au lieu d'une » est ce contre quoi une API de paiement se protège, et la
clé d'idempotence est la réponse de l'industrie.

## Règles

- L'en-tête est **facultatif**. Le PRD ne mentionne pas l'idempotence et les
  suites vendorées n'envoient rien de tel : AC-1 est ce qui garantit que le
  contrat externe reste celui de la spec.
- La clé est **cloisonnée par compte**. La contrainte porte sur
  `(userId, endpoint, key)` et jamais sur la clé seule : sans le compte, une
  collision de chaîne donnerait à un utilisateur la réponse destinée à un autre.
  AC-5 est une exigence de sécurité, pas de confort.
- La réservation précède l'exécution, et c'est la **contrainte d'unicité** qui
  tranche la concurrence — un pré-contrôle applicatif laisserait ouverte
  exactement la fenêtre que le double-clic exploite.
- AC-4 porte sur le **nombre de ressources créées**, pas sur le statut rendu à
  la perdante. Ce statut dépend d'une course que personne ne contrôle : 409 ou
  rejeu selon que la seconde requête arrive avant ou après la réponse de la
  première. La première rédaction de ce critère exigeait le 409 ; elle était
  vraie sur un poste et fausse sur le runner, où 201/201 avec un seul article
  est un comportement correct. Un critère qui fige un entrelacement décrit
  l'ordonnanceur, pas le mécanisme.
- Un échec **libère** la clé (AC-6). C'est la contrepartie obligatoire de la
  réservation anticipée : sans elle, le mécanisme protégerait du double envoi en
  échangeant ce défaut contre l'impossibilité de reprendre.

## Hors périmètre

- **Le front.** `apps/web` n'envoie pas de clé : décider où elle naît et comment
  elle survit à un rechargement est une question d'interface, traitée nulle part
  ici. L'absence est une décision, écrite dans l'[ADR 027](../../../adr/027-idempotence-des-creations-intercepteur-opt-in.md).
- **La purge des enregistrements.** Aucune limite de durée : le dépôt n'a pas
  d'ordonnanceur. La table croît, et elle porte une seconde copie du contenu
  utilisateur — donc une seconde chose à effacer le jour où la suppression de
  compte existera. Consigné dans l'ADR plutôt que découvert à ce moment-là.
- **Les autres verbes.** `PUT` et `DELETE` sont idempotents par sémantique HTTP,
  les favoris et le suivi le sont par construction (clé composite en base).
