---
id: REQ-COMMENT-004
title: Supprimer son propre commentaire
type: functional
domain: comment
status: approved
priority: must
source: "PRD §7.4, règle R-6 ; openapi.yml DELETE /articles/{slug}/comments/{id}"
acceptance_criteria:
  - id: AC-1
    given: "un commentaire et son auteur authentifié"
    when: "DELETE /api/articles/:slug/comments/:id est appelé"
    then: "l'API répond 204 sans corps, et le commentaire a disparu de la liste de l'article"
  - id: AC-2
    given: "un commentaire écrit par un autre utilisateur"
    when: "DELETE /api/articles/:slug/comments/:id est appelé avec un jeton valide"
    then: "l'API répond 403 et le commentaire subsiste (R-6)"
  - id: AC-3
    given: "un identifiant de commentaire inexistant"
    when: "DELETE /api/articles/:slug/comments/:id est appelé"
    then: "l'API répond 404"
  - id: AC-4
    given: "un commentaire existant, mais rattaché à un autre article que celui du chemin"
    when: "DELETE /api/articles/:slug/comments/:id est appelé par son auteur"
    then: "l'API répond 404 : l'identifiant seul ne suffit pas, le couple article/commentaire doit être cohérent"
  - id: AC-5
    given: "aucun jeton"
    when: "DELETE /api/articles/:slug/comments/:id est appelé"
    then: "l'API répond 401 et le commentaire subsiste"
implementation:
  files: []
  tests: []
related:
  issues: [4]
  requirements:
    - REQ-COMMENT-002
    - REQ-COMMENT-003
    - REQ-ARTICLE-006
  adrs:
    - "004"
    - "008"
---

# REQ-COMMENT-004 — Supprimer son propre commentaire

## Contexte

C'est le seul endroit du contrat où une ressource est adressée par un
identifiant **numérique séquentiel** et donc devinable
([ADR 004](../../../adr/004-persistance-alignee-sur-le-contrat.md)). L'ADR
assumait ce risque en s'appuyant explicitement sur la vérification
d'appartenance : la lecture est publique de toute façon, seule l'écriture doit
être gardée. AC-2 est donc le critère qui **paie la dette** contractée par cette
décision — si la garde tombe, l'énumérabilité devient un vrai problème.

AC-4 ferme une faille que le seul contrôle de propriété ne couvre pas. La route
porte deux identifiants (`:slug` et `:id`), et la tentation est d'ignorer le
premier puisque le second suffit à retrouver le commentaire. Un auteur pourrait
alors supprimer son commentaire en passant le slug de n'importe quel article —
inoffensif ici, mais c'est exactement le motif d'IDOR que la même route
exhiberait si la vérification de propriété était, elle, oubliée. On vérifie la
cohérence du chemin parce que le chemin l'affirme, pas parce que l'exploit est
spectaculaire.

L'ordre des contrôles est celui de [REQ-ARTICLE-005](../article/REQ-ARTICLE-005.md) :
existence d'abord (404), permission ensuite (403). Un 403 sur une ressource
inexistante affirmerait son existence.

## Règles

- Statut de succès : **204** sans corps (`openapi.yml`).
- **R-6** : seul l'auteur du commentaire le supprime ; sinon **403**
  ([ADR 008](../../../adr/008-permission-manquante-403.md)).
- Commentaire inconnu, ou non rattaché à l'article du chemin : **404**.
- Jeton absent ou invalide : **401**.
- L'auteur de l'**article** n'a aucun droit particulier sur les commentaires
  d'autrui : le contrat ne prévoit pas de modération, R-6 ne parle que de
  l'auteur du commentaire.
- La suppression est définitive, sans marquage logique
  ([REQ-ARTICLE-006](../article/REQ-ARTICLE-006.md), même parti pris).

## Hors périmètre

- La suppression en cascade lors de la suppression de l'article :
  [REQ-ARTICLE-006](../article/REQ-ARTICLE-006.md) AC-2.
- La modification d'un commentaire : absente du contrat RealWorld.
- Toute fonction de modération ou de signalement : hors périmètre.
