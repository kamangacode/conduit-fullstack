---
paths:
  - "apps/api/**"
  - "lefthook.yml"
  - "eslint.config.mjs"
  - ".github/workflows/**"
---

# Sécurité by design

La sécurité est câblée dans chaque couche, pas ajoutée après coup. Toute décision touchant l'auth, le chiffrement ou les données personnelles se documente en ADR.

## Garde des secrets (defense in depth)

- **Pre-commit** (`lefthook.yml`) : bloquer tout `.env*` commité, et détecter les patterns de clés/tokens secrets (regex ou outil dédié) avant qu'ils n'atteignent l'historique git.
- **Boot** : validation d'env au démarrage (voir section dédiée ci-dessous) — un secret manquant ou malformé doit empêcher le process de démarrer, pas produire un comportement dégradé silencieux.
- **CI** : scan de secrets sur le diff (ex : TruffleHog en mode `--only-verified`) + scan de dépendances (ex : OSV-Scanner) + SAST (ex : Semgrep). Un secret qui fuite dans un commit doit être détecté avant merge, pas après.

## Sécurité SQL

- **Interdiction** de `$queryRawUnsafe`/`$executeRawUnsafe` : utiliser les requêtes paramétrées Prisma (`$queryRaw` avec template tag, ou le query builder). Faire respecter par une règle de lint (`no-restricted-syntax` ou équivalent) plutôt que par la seule revue humaine.

## Anti-IDOR

Vérifier l'appartenance **au niveau de la requête SQL**, pas après coup en mémoire (`WHERE id = ? AND authorId = ?`, jamais un `findById` suivi d'un check applicatif qui laisse une fenêtre de course).

Renvoyer **404, pas 403**, quand la ressource existe mais n'appartient pas à l'utilisateur courant — un 403 confirme l'existence de la ressource à qui n'y a pas droit, un 404 ne fuite rien.

Exemple Conduit : un utilisateur ne peut éditer ou supprimer que **ses propres** articles et commentaires. `updateArticle(slug, userId, ...)` doit filtrer par `authorId` dans la requête elle-même, pas charger l'article puis comparer `article.author.id === userId` en post-traitement (fenêtre de lecture-avant-check, et un oubli du check rend la faille silencieuse).

## Server-side authority

Ne jamais faire confiance à l'identité ou à l'état porté par le payload client. Dériver l'identité et les champs sensibles côté serveur, à partir d'une source de confiance (session, token vérifié), jamais du body de la requête.

Exemple Conduit : l'`author` d'un article ou d'un commentaire vient toujours du JWT vérifié (`req.user.id`), **jamais** d'un champ `authorId` envoyé dans le body — sinon n'importe quel utilisateur authentifié pourrait publier un article au nom d'un autre.

## Chiffrement PII at-rest

Si un modèle stocke une donnée personnelle qui doit rester illisible en cas de fuite de la base (ex : l'email d'un `User`), chiffrer le champ **at-rest** (AES-256-GCM ou équivalent authentifié) plutôt que de le stocker en clair. Si ce champ doit rester recherchable en égalité (ex : login par email), ajouter un **blind index** (hash déterministe séparé, ex : HMAC) plutôt que de chercher sur le champ chiffré — le chiffrement authentifié n'est pas déterministe par construction.

## Validation d'env au boot

Valider les variables d'environnement au démarrage du process (schéma Zod ou équivalent), et **fail-fast** : un secret ou une config manquante doit empêcher le boot, jamais dégrader silencieusement en runtime. Erreur explicite en console/log au démarrage, pas une 500 aléatoire trois requêtes plus tard.
