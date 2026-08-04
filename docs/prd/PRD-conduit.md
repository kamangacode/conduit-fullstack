---
title: "PRD - Conduit (RealWorld), domaine de référence"
description: "Product Requirements Document complet de l'app Conduit (spec RealWorld) : vision, périmètre fonctionnel, modèle de données, spécification API exhaustive, auth JWT, gestion d'erreurs, règles métier, critères d'acceptation."
date: 2026-06-04
status: REFERENCE
source: "https://realworld-docs.netlify.app/ (spec RealWorld officielle)"
---

# PRD - Conduit (l'app RealWorld)

> Domaine métier de référence : l'app **Conduit** (spec RealWorld), implémentée ici en full-stack TypeScript. Ce PRD est la source de vérité fonctionnelle du repo — les commentaires de code y renvoient par section (`PRD §7`, `§8`, etc.).
>
> Spécifications RealWorld en local (Markdown) : [`./specifications/`](./specifications/).

---

## 1. Contexte et objectif

**Conduit** est l'application de référence du projet [RealWorld](https://realworld-docs.netlify.app/) : un clone de Medium (blogging social). Son intérêt pédagogique : le domaine métier est **figé et connu de tous les développeurs**, donc le lecteur d'un repo se concentre à 100% sur la technique d'architecture, jamais sur le métier.

Ce PRD sert à :
- Geler le périmètre fonctionnel (aucune dérive de scope).
- Servir de base aux REQ-as-code du repo (`docs/requirements/`).
- Garantir que l'implémentation reste fidèle au contrat RealWorld officiel (conformité vérifiée par la suite Hurl).

**Principe directeur** : on ne réinvente pas Conduit. On reprend la spec RealWorld à l'identique. La valeur est dans le **comment** (l'architecture et le craft), pas dans le **quoi**.

---

## 2. Vision produit

Conduit est une plateforme de publication d'articles communautaire. Un utilisateur peut :
- s'inscrire, se connecter, gérer son profil ;
- publier, éditer, supprimer des articles en Markdown, taggés ;
- lire un flux global ou un flux personnalisé (auteurs qu'il suit) ;
- suivre/ne plus suivre d'autres auteurs ;
- mettre en favori / retirer des favoris ;
- commenter les articles et supprimer ses propres commentaires ;
- filtrer les articles par tag.

---

## 3. Personas

| Persona | Description | Capacités |
|---|---|---|
| **Visiteur anonyme** | Non authentifié | Lire le flux global, lire un article, lire les profils, lire les commentaires, lister les tags |
| **Membre authentifié** | Compte + JWT | Tout ce qui précède + publier/éditer/supprimer ses articles, suivre, favoriser, commenter, flux personnel, éditer son profil |
| **Auteur** | Membre, propriétaire d'un article ou d'un commentaire | Éditer/supprimer **ses** articles, supprimer **ses** commentaires |

> Règle transverse : les champs `following` (profil) et `favorited` (article) sont calculés **relativement à l'utilisateur courant**. Pour un visiteur anonyme, ils valent toujours `false`.

---

## 4. Périmètre fonctionnel (MoSCoW)

### Must

| ID | Fonctionnalité |
|---|---|
| F-AUTH-1 | Inscription (email, username, password) |
| F-AUTH-2 | Connexion (email, password) → renvoie un JWT |
| F-AUTH-3 | Récupérer l'utilisateur courant (via JWT) |
| F-AUTH-4 | Mettre à jour l'utilisateur courant (email, username, password, bio, image) |
| F-PROF-1 | Consulter un profil public |
| F-PROF-2 | Suivre / ne plus suivre un utilisateur |
| F-ART-1 | Lister les articles (filtres tag / author / favorited, pagination) |
| F-ART-2 | Flux personnel (articles des auteurs suivis) |
| F-ART-3 | Consulter un article par slug |
| F-ART-4 | Créer un article (title, description, body, tagList) |
| F-ART-5 | Éditer un article (auteur uniquement) |
| F-ART-6 | Supprimer un article (auteur uniquement) |
| F-CMT-1 | Ajouter un commentaire |
| F-CMT-2 | Lister les commentaires d'un article |
| F-CMT-3 | Supprimer un commentaire (auteur uniquement) |
| F-FAV-1 | Favoriser / définavoriser un article |
| F-TAG-1 | Lister les tags |

### Should

| ID | Fonctionnalité |
|---|---|
| F-UI-1 | Rendu Markdown du body côté client |
| F-UI-2 | Header contextuel (authentifié vs anonyme) |
| F-UI-3 | Sidebar "Popular Tags" |

### Could / Won't (hors périmètre)

- Pas de messagerie, pas de notifications, pas de recherche plein texte, pas d'upload d'image (l'image est une URL), pas de rôles/admin.

---

## 5. Parcours et routes frontend

> Routing en hash (`/#/...`) dans la spec de référence. JWT stocké en `localStorage`.

| Route | Page | Auth |
|---|---|---|
| `/#/` | Home : liste des tags, articles (flux global / personnel / par tag), pagination | Optionnel |
| `/#/login` | Connexion | Anonyme |
| `/#/register` | Inscription | Anonyme |
| `/#/settings` | Paramètres du compte + déconnexion | Requis |
| `/#/editor` | Créer un article | Requis |
| `/#/editor/:slug` | Éditer un article | Requis (auteur) |
| `/#/article/:slug` | Article : body Markdown, commentaires, bouton supprimer (auteur) | Optionnel |
| `/#/profile/:username` | Profil + articles de l'utilisateur | Optionnel |
| `/#/profile/:username/favorites` | Articles favoris de l'utilisateur | Optionnel |

> Le BFF (repo #3) introduit en plus un client mobile : le PRD frontend reste la référence des besoins, le BFF adapte les réponses par client.

---

## 6. Modèle de données

```
User 1 ──< Article >── many Tag        (un article a une tagList)
User 1 ──< Comment >── 1 Article
User many ──< Follow >── many User      (relation de suivi)
User many ──< Favorite >── many Article (relation de favori)
```

### User (entité privée)

| Champ | Type | Notes |
|---|---|---|
| email | string | unique, requis |
| username | string | unique, requis |
| password | string | requis, **stocké hashé**, jamais renvoyé |
| bio | string | nullable |
| image | string (URL) | nullable, avatar par défaut possible |
| token | string (JWT) | renvoyé dans les réponses User uniquement |

### Profile (vue publique de User)

| Champ | Type | Notes |
|---|---|---|
| username | string | |
| bio | string | nullable |
| image | string (URL) | |
| following | bool | relatif à l'utilisateur courant |

### Article

| Champ | Type | Notes |
|---|---|---|
| slug | string | **généré depuis le title** (kebab-case), identifiant public |
| title | string | requis |
| description | string | requis |
| body | string (Markdown) | requis ; **non renvoyé dans les listes** (cf. règle R-7) |
| tagList | string[] | |
| createdAt | datetime ISO 8601 | |
| updatedAt | datetime ISO 8601 | |
| favorited | bool | relatif à l'utilisateur courant |
| favoritesCount | int | |
| author | Profile | |

### Comment

| Champ | Type | Notes |
|---|---|---|
| id | int | |
| body | string | requis |
| createdAt | datetime ISO 8601 | |
| updatedAt | datetime ISO 8601 | |
| author | Profile | |

### Tag

Chaîne simple. Pas d'entité riche.

---

## 7. Spécification API (exhaustive)

Base URL : `/api`. En-tête d'authentification : `Authorization: Token jwt.token.here`. Content-Type des réponses : `application/json; charset=utf-8`.

### 7.1 Authentification et utilisateur

| Action | Méthode | Path | Auth | Champs requis |
|---|---|---|---|---|
| Connexion | POST | `/api/users/login` | Non | email, password |
| Inscription | POST | `/api/users` | Non | username, email, password |
| Utilisateur courant | GET | `/api/user` | Oui | - |
| Mise à jour | PUT | `/api/user` | Oui | (tous optionnels : email, username, password, image, bio) |

```jsonc
// POST /api/users/login
{"user":{"email":"jake@jake.jake","password":"jakejake"}}

// POST /api/users
{"user":{"username":"Jacob","email":"jake@jake.jake","password":"jakejake"}}

// PUT /api/user
{"user":{"email":"jake@jake.jake","bio":"I like to skateboard","image":"https://i.stack.imgur.com/xHWG8.jpg"}}
```

### 7.2 Profils

| Action | Méthode | Path | Auth |
|---|---|---|---|
| Consulter | GET | `/api/profiles/:username` | Optionnel |
| Suivre | POST | `/api/profiles/:username/follow` | Oui |
| Ne plus suivre | DELETE | `/api/profiles/:username/follow` | Oui |

### 7.3 Articles

| Action | Méthode | Path | Auth | Query / Body |
|---|---|---|---|---|
| Lister | GET | `/api/articles` | Optionnel | `tag`, `author`, `favorited`, `limit` (def. 20), `offset` (def. 0) |
| Flux personnel | GET | `/api/articles/feed` | Oui | `limit`, `offset` |
| Consulter | GET | `/api/articles/:slug` | Non | - |
| Créer | POST | `/api/articles` | Oui | title, description, body (+ tagList) |
| Éditer | PUT | `/api/articles/:slug` | Oui (auteur) | title, description, body (optionnels) |
| Supprimer | DELETE | `/api/articles/:slug` | Oui (auteur) | - |

```jsonc
// POST /api/articles
{"article":{"title":"How to train your dragon","description":"Ever wonder how?","body":"You have to believe","tagList":["reactjs","angularjs","dragons"]}}

// PUT /api/articles/:slug
{"article":{"title":"Did you train your dragon?"}}
```

### 7.4 Commentaires

| Action | Méthode | Path | Auth |
|---|---|---|---|
| Ajouter | POST | `/api/articles/:slug/comments` | Oui |
| Lister | GET | `/api/articles/:slug/comments` | Optionnel |
| Supprimer | DELETE | `/api/articles/:slug/comments/:id` | Oui (auteur) |

```jsonc
// POST /api/articles/:slug/comments
{"comment":{"body":"His name was my name too."}}
```

### 7.5 Favoris et tags

| Action | Méthode | Path | Auth |
|---|---|---|---|
| Favoriser | POST | `/api/articles/:slug/favorite` | Oui |
| Définavoriser | DELETE | `/api/articles/:slug/favorite` | Oui |
| Lister les tags | GET | `/api/tags` | Non |

---

## 8. Formats de réponse (verbatim)

### User (avec token)
```json
{
  "user": {
    "email": "jake@jake.jake",
    "token": "jwt.token.here",
    "username": "jake",
    "bio": "I work at statefarm",
    "image": null
  }
}
```

### Profile
```json
{
  "profile": {
    "username": "jake",
    "bio": "I work at statefarm",
    "image": "https://api.realworld.io/images/smiley-cyrus.jpg",
    "following": false
  }
}
```

### Single Article
```json
{
  "article": {
    "slug": "how-to-train-your-dragon",
    "title": "How to train your dragon",
    "description": "Ever wonder how?",
    "body": "It takes a Jacobian",
    "tagList": ["dragons", "training"],
    "createdAt": "2016-02-18T03:22:56.637Z",
    "updatedAt": "2016-02-18T03:48:35.824Z",
    "favorited": false,
    "favoritesCount": 0,
    "author": {
      "username": "jake",
      "bio": "I work at statefarm",
      "image": "https://i.stack.imgur.com/xHWG8.jpg",
      "following": false
    }
  }
}
```

### Multiple Articles
```json
{
  "articles": [
    {
      "slug": "how-to-train-your-dragon",
      "title": "How to train your dragon",
      "description": "Ever wonder how?",
      "tagList": ["dragons", "training"],
      "createdAt": "2016-02-18T03:22:56.637Z",
      "updatedAt": "2016-02-18T03:48:35.824Z",
      "favorited": false,
      "favoritesCount": 0,
      "author": {
        "username": "jake",
        "bio": "I work at statefarm",
        "image": "https://i.stack.imgur.com/xHWG8.jpg",
        "following": false
      }
    }
  ],
  "articlesCount": 2
}
```

### Single Comment
```json
{
  "comment": {
    "id": 1,
    "createdAt": "2016-02-18T03:22:56.637Z",
    "updatedAt": "2016-02-18T03:22:56.637Z",
    "body": "It takes a Jacobian",
    "author": {
      "username": "jake",
      "bio": "I work at statefarm",
      "image": "https://i.stack.imgur.com/xHWG8.jpg",
      "following": false
    }
  }
}
```

### Multiple Comments
```json
{
  "comments": [
    {
      "id": 1,
      "createdAt": "2016-02-18T03:22:56.637Z",
      "updatedAt": "2016-02-18T03:22:56.637Z",
      "body": "It takes a Jacobian",
      "author": {
        "username": "jake",
        "bio": "I work at statefarm",
        "image": "https://i.stack.imgur.com/xHWG8.jpg",
        "following": false
      }
    }
  ]
}
```

### Tags
```json
{
  "tags": ["reactjs", "angularjs"]
}
```

---

## 9. Authentification

- Mécanisme : **JWT**.
- En-tête des requêtes authentifiées : `Authorization: Token jwt.token.here` (préfixe `Token`, pas `Bearer`).
- Le token n'est renvoyé que dans les réponses `User` (login, register, get/update user).
- Côté frontend de référence : le token est stocké en `localStorage`.
- Les endpoints "Auth Optionnel" adaptent leur réponse selon la présence/validité du token (calcul de `following` / `favorited`).

---

## 10. Gestion des erreurs

| Code | Cas |
|---|---|
| 422 Unprocessable Entity | Échec de validation |
| 401 Unauthorized | Authentification requise mais absente/invalide |
| 403 Forbidden | Requête valide mais permission manquante (ex: éditer l'article d'un autre) |
| 404 Not Found | Ressource introuvable |

Format des erreurs de validation (verbatim) :
```json
{"errors":{"body":["can't be empty"]}}
```
La clé `errors` mappe des noms de champs vers des tableaux de messages.

---

## 11. Règles métier

| ID | Règle |
|---|---|
| R-1 | Le `slug` d'un article est généré depuis le `title` (kebab-case) et sert d'identifiant public. |
| R-2 | La liste des articles est triée par date de création décroissante (plus récents d'abord). |
| R-3 | `GET /api/articles` accepte au plus un usage cohérent des filtres `tag`, `author`, `favorited`, combinés à `limit`/`offset`. |
| R-4 | Le flux personnel (`/feed`) ne renvoie que les articles des auteurs suivis par l'utilisateur courant ; il exige l'authentification. |
| R-5 | `following` et `favorited` sont calculés relativement à l'utilisateur courant (`false` si anonyme). |
| R-6 | Seul l'auteur peut éditer/supprimer son article et supprimer son commentaire (sinon 403). |
| R-7 | Depuis le 2024-08-16, les endpoints de **liste** d'articles ne renvoient plus le `body` (performance). Le `body` reste présent sur l'article unitaire. |
| R-8 | `email` et `username` sont uniques. |
| R-9 | Le `password` n'est jamais renvoyé ; il est stocké hashé. |
| R-10 | Pagination : `limit` défaut 20, `offset` défaut 0. |

---

## 12. Exigences non-fonctionnelles

| Domaine | Exigence |
|---|---|
| Format | JSON ; `Content-Type: application/json; charset=utf-8`. |
| Sécurité | Mots de passe hashés ; JWT signé ; pas de fuite de champ sensible. |
| Cohérence | Les 5 repos doivent passer le **même** jeu de tests fonctionnels (la spec RealWorld fournit une suite de conformité officielle, cf. section 15). |
| Performance | Listes paginées ; pas de `body` dans les listes (R-7). |
| Observabilité | Selon repo (notamment `conduit-microservices`, phase durcissement). |

> Recommandation : utiliser la **suite de conformité RealWorld** (tests Hurl, cf. section 15) comme garde-fou commun. Un repo n'est "conforme Conduit" que s'il la passe. C'est ce qui rend les implémentations rigoureusement comparables.

---

## 13. Critères d'acceptation (communs à tout repo Conduit)

- [ ] Tous les endpoints de la section 7 répondent avec les formats de la section 8.
- [ ] L'authentification JWT fonctionne (`Authorization: Token ...`).
- [ ] Les erreurs respectent la section 10 (422 + format `errors`).
- [ ] Les règles métier R-1 à R-10 sont respectées.
- [ ] La suite de conformité RealWorld (tests Hurl) passe au vert (cf. section 15).
- [ ] Les champs relatifs (`following`, `favorited`) sont corrects pour anonyme et authentifié.

---

## 14. Portée par repo (le même Conduit, 5 angles)

| Repo | Implémente | Particularité vs ce PRD |
|---|---|---|
| `conduit-craft-ai` | Conduit complet, monolithe hexagonal | Référence d'implémentation. Scope v1 : auth + articles + commentaires |
| `conduit-api-first` | Conduit complet | Le contrat OpenAPI **précède** l'implémentation ; les types sont générés |
| `conduit-bff` | Conduit + 2 clients (web, mobile) | Ajoute une couche BFF par client ; les réponses sont adaptées par client |
| `conduit-microservices` | Conduit découpé puis durci | Bounded contexts (articles, users, comments) + database-per-service, puis circuit breaker / retry / async (résilience) |
| `conduit-fullstack` | Conduit en full-stack TypeScript | Monorepo api + web + shared ; modèle partagé, type safety bout-en-bout (contraste avec la spine Java) |

> Le **quoi** (ce PRD) ne change jamais. Seul le **comment** change d'un repo à l'autre. C'est le pari RealWorld : domaine figé, architecture variable.

---

## 15. Suite de conformité (tests officiels RealWorld)

> Important : la spec RealWorld **a évolué**. L'ancienne collection Postman/Newman est obsolète. La suite actuelle vit dans le dépôt `gothinkster/realworld`, dossier `specs/`.

### 15.1 Tests API

| Élément | Détail |
|---|---|
| Source de vérité | Tests **Hurl** (`specs/api/hurl/`), https://hurl.dev |
| Collection alternative | **Bruno** (`specs/api/bruno/`), générée depuis Hurl, https://www.usebruno.com |
| Contrat | `specs/api/openapi.yml` - **OpenAPI officiel** de Conduit (à réutiliser directement par le repo `conduit-api-first`) |
| Synchro | Bruno régénéré via `make bruno-generate`, vérifié en CI via `make bruno-check` |

Commandes (verbatim) :
```bash
# Tests Hurl (source de vérité)
HOST=http://localhost:3000/api ./run-api-tests-hurl.sh

# Tests Bruno (généré, équivalent)
HOST=http://localhost:3000/api ./run-api-tests-bruno.sh
```

### 15.2 Tests end-to-end (frontend)

Spécifications Playwright dans `specs/e2e/` (TypeScript), incluant : `auth.spec.ts`, `articles.spec.ts`, `comments.spec.ts`, `social.spec.ts`, `settings.spec.ts`, `navigation.spec.ts`, `error-handling.spec.ts`, `null-fields.spec.ts`, `xss-security.spec.ts`, `url-navigation.spec.ts`, `health.spec.ts`. Un fichier `SELECTORS.md` documente les sélecteurs attendus côté UI.

### 15.3 Usage recommandé par repo

| Repo | Suite de conformité à viser |
|---|---|
| `conduit-craft-ai` | Tests Hurl (API) au vert ; ce sont les tests d'acceptation |
| `conduit-api-first` | Partir de `specs/api/openapi.yml` comme contrat, puis Hurl au vert |
| `conduit-bff` | Hurl sur le back ; e2e Playwright par client |
| `conduit-microservices` | Hurl au vert malgré la découpe (la conformité ne change pas) + scénarios de panne maison (durcissement) |
| `conduit-fullstack` | Hurl au vert sur l'API + e2e Playwright sur le front |

---

## 16. Sources

> Les spécifications RealWorld ont été rapatriées en local (Markdown verbatim) dans [`./specifications/`](./specifications/). Travailler depuis ces fichiers plutôt que les URLs. Les liens ci-dessous sont la source amont d'origine.

- Spécifications locales : [`./specifications/`](./specifications/) (backend, frontend, mobile, tests)
- Spec RealWorld officielle (amont) : https://realworld-docs.netlify.app/
  - Introduction : https://realworld-docs.netlify.app/introduction/
  - Endpoints : https://realworld-docs.netlify.app/specifications/backend/endpoints/
  - Formats de réponse : https://realworld-docs.netlify.app/specifications/backend/api-response-format/
  - Gestion d'erreurs : https://realworld-docs.netlify.app/specifications/backend/error-handling/
  - Routing frontend : https://realworld-docs.netlify.app/specifications/frontend/routing/
  - Fonctionnalités : https://realworld-docs.netlify.app/specifications/frontend/templates/
- Dépôt officiel : https://github.com/gothinkster/realworld
  - Suite de conformité API : https://github.com/gothinkster/realworld/tree/main/specs/api
  - OpenAPI officiel : https://github.com/gothinkster/realworld/blob/main/specs/api/openapi.yml
  - Tests e2e Playwright : https://github.com/gothinkster/realworld/tree/main/specs/e2e
