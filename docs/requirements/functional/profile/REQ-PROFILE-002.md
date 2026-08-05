---
id: REQ-PROFILE-002
title: Consulter le profil public d'un utilisateur
type: functional
domain: profile
status: approved
priority: must
source: "PRD §7.2, §8 (format « Profile »), règle R-5 ; openapi.yml GET /profiles/{username}"
acceptance_criteria:
  - id: AC-1
    given: "un username existant et un appelant anonyme"
    when: "GET /api/profiles/:username est appelé"
    then: "l'API répond 200 avec l'enveloppe `{ profile: … }` et `following` à false"
  - id: AC-2
    given: "un username existant, déjà suivi par l'appelant authentifié"
    when: "GET /api/profiles/:username est appelé avec un jeton valide"
    then: "l'API répond 200 et `following` vaut true"
  - id: AC-3
    given: "un username que ne porte aucun compte"
    when: "GET /api/profiles/:username est appelé"
    then: "l'API répond 404"
  - id: AC-4
    given: "un profil dont le compte porte un email et un condensat de mot de passe"
    when: "la réponse est produite"
    then: "elle ne contient que username, bio, image et following — ni email, ni condensat, ni identifiant interne"
implementation:
  files: []
  tests: []
related:
  issues: [3]
  requirements:
    - REQ-PROFILE-001
    - REQ-PROFILE-003
    - REQ-AUTH-001
  adrs: []
---

# REQ-PROFILE-002 — Consulter le profil public d'un utilisateur

## Contexte

Le profil est la **vue publique** d'un compte : la même entité `User`, amputée de
tout ce qui la rend privée. C'est le premier endpoint du dépôt à authentification
**optionnelle**, et donc le premier à devoir produire deux réponses différentes
pour la même ressource selon l'appelant.

`following` (règle R-5) n'est pas un attribut du profil consulté : c'est une
relation entre l'appelant et lui. Le même profil renvoie donc `false` à un
visiteur anonyme, `false` à un utilisateur qui ne le suit pas, et `true` à un
utilisateur qui le suit — trois réponses pour une seule ressource. C'est pourquoi
le champ appartient à la représentation transportée et non au modèle persisté,
comme l'établit déjà [REQ-PROFILE-001](REQ-PROFILE-001.md).

AC-4 protège une fuite plausible plutôt que théorique. Le profil se construit par
projection depuis l'entité `User`, qui porte l'email et le condensat du mot de
passe ; une projection écrite par étalement (`...user`) les emporterait tous les
deux. Le critère demande une assertion sur les clés **effectivement présentes**,
pas seulement sur la présence des quatre attendues.

## Règles

- Statut de succès : **200** ; username inconnu : **404** (`openapi.yml`).
- Format `Profile` : PRD §8, verbatim — `username`, `bio`, `image`, `following`.
- **R-5** : `following` est calculé relativement à l'appelant, et vaut `false`
  pour un anonyme.
- L'authentification est optionnelle : un jeton absent ou invalide n'est pas une
  erreur, il produit une consultation anonyme
  ([REQ-AUTH-001](../auth/REQ-AUTH-001.md) AC-5).
- L'identifiant public est le **username**, jamais l'identifiant interne : ce
  dernier ne sort pas de l'API.

## Hors périmètre

- **Suivre** ou **ne plus suivre** : voir [REQ-PROFILE-003](REQ-PROFILE-003.md).
  Cette exigence ne fait que *lire* la relation.
- La liste des abonnés ou des abonnements : absente du contrat RealWorld.
- Les articles de l'utilisateur consulté : relèvent de `GET /api/articles?author=`,
  slice F3.
