# ADR 027 — Idempotence des créations : intercepteur opt-in, réponse rejouée verbatim

## Status

Accepted — 2026-08-08. Item C4 du plan d'outillage (« clé d'idempotence sur la
création de commentaire/article, proxy du paiement, test d'intégration de
rejeu »).

## Context

Un double envoi de `POST /api/articles` ne produit aujourd'hui **aucune erreur**.
La résolution de slug repart du slug de base et suffixe sur refus de la
contrainte d'unicité ([ADR 010](010-unicite-du-slug-par-la-contrainte.md),
`prisma-article.repository.ts`) : deux requêtes identiques créent donc deux
articles, le second sur `mon-titre-2`. Côté commentaires, l'identifiant est un
`autoincrement` sans aucune unicité — deux commentaires identiques, sans même un
conflit à signaler. Dans les deux cas la réponse est un 201, et rien ne distingue
la seconde publication d'une publication voulue.

Ce n'est pas un défaut de Conduit : c'est le mode d'échec normal d'un `POST` non
idempotent, que tout réseau produit tôt ou tard — double-clic, reprise après
timeout, rejeu d'un client mobile qui a perdu la réponse. L'item C4 le traite
comme **proxy du paiement** : le dépôt ne facture rien, mais un « créer deux fois
au lieu d'une » est exactement ce contre quoi une API de paiement se protège, et
le mécanisme de l'industrie — une clé d'idempotence fournie par le client — est
le même.

**La contrainte qui écarte des options avant toute discussion.** Ni le PRD ni la
spec RealWorld ne mentionnent l'idempotence, et les deux suites vendorées (Hurl,
Playwright) n'envoient aucun en-tête de ce genre — vérifié par recherche dans
`apps/api/conformance/` et `apps/web/conformance/`. Le mécanisme doit donc être
**opt-in** : en-tête absent, comportement strictement inchangé. Toute variante le
rendant obligatoire ferait rougir les deux gates de conformité, et le contrat
externe cesserait d'être celui de la spec.

## Options Considered

### Axe 1 — où le mécanisme s'insère

| Option | Trade-off |
|---|---|
| **A — Intercepteur `interface/` + port (retenue)** | Un intercepteur NestJS activé par un décorateur sur les seules routes visées, adossé à un port implémenté en Prisma. Le use-case ignore qu'un client a rejoué, comme il ignore déjà l'authentification, portée par un guard. L'idempotence est une préoccupation de **transport** : elle parle de requêtes répétées, pas d'articles. |
| B — Paramètre d'entrée du use-case | Explicite, testable à doublure en lane unit. Écartée : le use-case apprendrait une notion d'en-tête HTTP, ce que la [rule 12](../../.claude/rules/12-backend-hexagonal.md) interdit à `application/`, et chaque use-case futur devrait y penser. |
| C — Service appelé par le contrôleur | Lisible d'un coup d'œil. Écartée : la même séquence recopiée à chaque endpoint protégé, et un oubli qui ne se voit nulle part — le défaut que le registre de contrat de l'[ADR 026](026-tests-de-contrat-assertion-symetrique-et-intercepteur.md) vient précisément de fermer ailleurs. |

### Axe 2 — ce que l'on rejoue

| Option | Trade-off |
|---|---|
| **A — La réponse stockée, verbatim (retenue)** | Statut et corps conservés à la première exécution, resservis tels quels. C'est la sémantique des API dont cet item est le proxy : *même requête, même réponse*, quoi qu'il soit arrivé depuis. Coût réel : une **seconde copie du contenu utilisateur** en base. |
| B — La clé + l'identifiant, puis relecture | Aucune duplication, donc rien de plus à effacer. Écartée : le rejeu renverrait l'état **courant**, donc une réponse que la requête d'origine n'a jamais produite — un `GET` déguisé en rejeu. Un client qui republie après timeout recevrait l'article tel qu'un tiers l'a modifié entre-temps, et n'aurait aucun moyen de le savoir. |

### Axe 3 — même clé, corps différent

| Option | Trade-off |
|---|---|
| **A — 422 avec empreinte du corps (retenue)** | Une empreinte du corps accompagne la clé ; un corps différent sous la même clé est refusé en 422, code déjà au contrat §10. Transforme un bug client silencieux en message explicite. |
| B — Rejouer sans regarder le corps | Aucune empreinte à calculer. Écartée : un client qui réutilise sa clé par erreur recevrait la réponse d'une **autre** requête et croirait sa seconde publication réussie — un faux positif, la catégorie de défaut la plus chère à diagnostiquer. |

### Axe 4 — deux requêtes concurrentes portant la même clé

| Option | Trade-off |
|---|---|
| **A — Contrainte unique, la perdante reçoit 409 (retenue)** | La clé est insérée **avant** l'exécution sous contrainte `@unique` : c'est la base qui tranche la course. Même raisonnement que l'ADR 010 sur le slug — un pré-contrôle applicatif est un TOCTOU, et la fenêtre qu'il laisse est exactement le double-clic que l'item vise. |
| B — La seconde attend puis rejoue | Plus confortable pour le client. Écartée : demande un mécanisme d'attente et un délai de garde, et une requête qui attend une autre requête est la porte d'entrée d'un épuisement du pool de connexions. |
| C — Ne rien traiter | Écartée : ne couvrirait que le rejeu **séquentiel**, en laissant ouvert le cas simultané — celui pour lequel le mécanisme existe. |

## Decision

Un en-tête `Idempotency-Key` **facultatif** sur `POST /api/articles` et
`POST /api/articles/:slug/comments`. Absent, rien ne change.

Présent, un intercepteur `interface/idempotency/` :

1. **Réserve la clé avant d'exécuter**, par un `INSERT` sous contrainte unique.
   La violation (`P2002`) signifie qu'une autre requête détient la clé : si une
   réponse y est déjà attachée, on la rejoue ; sinon la course est en cours et
   l'appelant reçoit **409**.
2. **Cloisonne par utilisateur.** La contrainte porte sur
   `(userId, endpoint, key)`, jamais sur la clé seule. Sans le `userId`, la clé
   `abc` d'un compte donnerait accès à la réponse d'un autre — une fuite de
   données par collision de chaîne, et le contraire de l'autorité serveur exigée
   par la [rule 19](../../.claude/rules/19-securite.md). Les deux endpoints étant
   authentifiés, l'identité est toujours disponible.
3. **Compare une empreinte du corps.** Corps différent sous la même clé → 422 au
   format §10.
4. **Attache la réponse après succès**, statut et corps, et la ressert verbatim
   au rejeu.
5. **Libère la réservation si la requête échoue.** Une clé consommée par un
   échec bloquerait définitivement la reprise — or reprendre après échec est
   précisément l'usage d'une clé d'idempotence. Une requête ratée doit rester
   rejouable.

Le point 5 est la subtilité que la forme « réserver avant d'exécuter » introduit
et qu'elle doit refermer elle-même : sans lui, le mécanisme protégerait du double
envoi au prix d'interdire la reprise, c'est-à-dire en échangeant un défaut contre
un autre.

### Deux choix de rangement, et leur raison

**Les messages restent dans `apps/api`**, pas dans `CONTRACT_MESSAGES` de
`packages/shared`. Cette table vaut par une propriété que l'[ADR 017](017-messages-du-contrat-dans-shared.md)
lui donne : chaque entrée cite le fichier de conformité qui l'exige, ce qui
distingue « le contrat dit ceci » de « nous avons choisi ceci ». Les messages
d'idempotence relèvent du second cas et aucun client de l'écosystème RealWorld ne
les attend. Les y ranger diluerait la seule chose qui rend cette table fiable.

**Le front n'envoie pas de clé.** `apps/web` n'est pas câblé, délibérément :
l'item porte sur le mécanisme d'API et sa preuve de rejeu. Le brancher côté front
demanderait de décider où naît la clé (au montage du formulaire ? au premier
envoi ?) et comment elle survit à un rechargement — une question d'interface, pas
d'API. Elle n'est pas traitée ici, et cette phrase est là pour que l'absence se
lise comme une décision.

### Ce que ce mécanisme ne fait pas

- **Aucune purge.** Les enregistrements sont conservés sans limite de durée : le
  dépôt n'a pas d'ordonnanceur, et en poser un pour cet item seul dépasserait
  largement son périmètre. La conséquence est une table qui croît, et surtout une
  **seconde copie du contenu utilisateur** — donc une seconde chose à effacer le
  jour où la suppression de compte sera implémentée. Le cadrage RGPD du
  2026-08-08 (`artifacts/prds/`) traite l'effacement par anonymisation ; cette
  table devra y figurer. Écrit ici plutôt que découvert à ce moment-là.
- **Aucune garantie inter-processus au-delà de la base.** La sérialisation repose
  entièrement sur la contrainte unique de PostgreSQL, ce qui est suffisant tant
  qu'une seule base fait autorité — et le reste si l'API est répliquée.
- **Rien pour les autres verbes.** `PUT` et `DELETE` sont déjà idempotents par
  sémantique HTTP ; les favoris le sont par construction (clé composite, ADR de
  la slice F3). Seules les deux créations en avaient besoin.

## Consequences

### Positive

- Le mode d'échec le plus banal d'un `POST` — le double envoi — cesse de produire
  une ressource fantôme silencieuse, et le dépôt gagne un exemple exécutable du
  mécanisme que les API de paiement imposent.
- La protection est **déclarative** : un décorateur sur la route. Un endpoint de
  création futur s'y ajoute d'une ligne, sans que sa logique métier change.
- La course est tranchée par la base, pas par du code applicatif : la propriété
  ne dépend pas de l'ordonnancement des requêtes, donc elle ne se dégrade pas
  sous charge — le seul régime où ce genre de défaut se manifeste.

### Negative

- Une table de plus, qui croît sans purge, et qui **duplique du contenu
  utilisateur**. C'est le prix du rejeu verbatim ; l'option B l'évitait au prix
  d'une sémantique fausse, et ce prix-là était plus élevé.
- Un mécanisme qu'aucun client du dépôt n'utilise aujourd'hui, `apps/web`
  compris. Il est donc éprouvé par ses seuls tests — raison de plus pour que ces
  tests soient hostiles, comme pour tout garde-fou préventif du dépôt.
- L'en-tête est hors spec RealWorld. Un lecteur qui compare l'API à la spec y
  verra un écart ; cet ADR est la réponse, et le fait qu'il soit facultatif rend
  l'écart inobservable pour qui suit la spec.

### Neutral

- Aucune dépendance nouvelle : NestJS fournit l'intercepteur, Prisma la
  contrainte, `node:crypto` l'empreinte.
- Le décorateur ne s'applique qu'aux deux routes nommées. Étendre la protection
  est un choix à faire route par route, pas un défaut global — un `POST` non
  déclaré reste non protégé, et c'est visible à la lecture du contrôleur.
