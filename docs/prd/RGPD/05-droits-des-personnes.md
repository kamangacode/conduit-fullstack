# Droits des personnes concernées

> Spécifie l'exercice des droits d'accès (Art. 15), de portabilité (Art. 20), de rectification
> (Art. 16) et d'effacement (Art. 17) en **self-service** sur le compte authentifié. Les endpoints
> RGPD sont une **extension tracée**, hors du périmètre vérifié par la suite de conformité RealWorld.

## 1. Modèle d'exercice

Conduit n'a ni rôle admin ni RBAC. La personne concernée est donc l'**utilisateur authentifié
lui-même**, son identité étant prouvée par le JWT (`sub = userId`, ADR 007). Deux chemins :

- **Chemin self-service (V1)** : endpoints protégés par `AuthGuard`, agissant exclusivement sur le
  compte de l'appelant (`request.user.id`). Aucun accès aux données d'un tiers, donc aucun risque
  d'IDOR sur ces routes.
- **Chemin assisté** : une demande envoyée au point de contact ([SECURITY.md](../../../SECURITY.md))
  est traitée par le responsable de traitement, qui exécute l'opération correspondante (script
  d'export / d'anonymisation) après vérification raisonnable de l'identité. Utile si la personne a
  perdu l'accès à son compte.

> **Contrat RealWorld** : ces endpoints n'existent pas dans le contrat officiel. Ils sont ajoutés
> hors du périmètre Hurl/Playwright officiel (comme le SSE, voir `docs/scope/hors-perimetre.md`), et
> ne modifient aucun endpoint existant. Préfixe suggéré : `/api/user/...` (cohérent avec la ressource
> compte), ou un sous-arbre `/api/gdpr/...` dédié.

## 2. Droit d'accès et portabilité (Art. 15 / 20)

### Endpoint

`GET /api/user/export` (authentifié). Réponse `200` : un document **JSON** rassemblant toutes les
données rattachées à l'appelant, dans un format lisible par une machine et réutilisable.

### Contenu de l'export

| Section | Source | Notes |
|---------|--------|-------|
| `profile` | `User` | email (déchiffré), username, bio, image, createdAt, updatedAt. Jamais `passwordHash` |
| `articles` | `Article` (authorId = appelant) | title, description, body, slug, tags, dates |
| `comments` | `Comment` (authorId = appelant) | body, articleId, dates |
| `favorites` | `Favorite` (userId = appelant) | articleId, date |
| `following` | `Follow` (followerId = appelant) | followingId, date |
| `followers` | `Follow` (followingId = appelant) | followerId, date |
| `exportedAt` | serveur | horodatage ISO 8601 |

### Règles

- L'email est **déchiffré de façon transparente** pour l'export (la personne a le droit d'accéder à
  sa propre donnée en clair).
- Sérialisation stable : dates en ISO 8601, pas de champ technique interne inutile.
- Journalisé : entrée d'audit `gdpr.export` avec compteur d'entités ([04](04-logging-audit-pii-safe.md)).
- Délai : réponse synchrone (volume faible par utilisateur). L'Art. 12(3) impose un mois maximum ;
  le self-service est immédiat.

## 3. Droit de rectification (Art. 16)

Déjà couvert par `PUT /api/user` (email, username, bio, image, password), avec la sémantique de
contrat existante sur `bio`/`image` (distinction `null` = effacer vs `""` = vide,
schema.prisma:31-35). Le PRD le documente comme mesure de rectification. Contrainte : une
modification de l'email recalcule le chiffrement et le blind index ([03](03-chiffrement-pii.md)).

## 4. Droit à l'effacement (Art. 17) par anonymisation

### Endpoint

`DELETE /api/user` (authentifié). Réponse `200` : confirmation d'anonymisation. **Idempotent** :
appeler deux fois ne produit pas d'erreur (un compte déjà anonymisé renvoie un état stable).

### Pourquoi l'anonymisation plutôt que la suppression dure

Toutes les FK utilisateur sont `onDelete: Cascade` (schema.prisma). Un `delete` du `User`
détruirait ses articles et commentaires **publics**, cassant les fils de discussion et retirant du
contenu que d'autres consultent. L'anonymisation **dissocie** l'identité du contenu : les articles
et commentaires restent, rattachés à un auteur devenu anonyme.

### Opération (transactionnelle)

Dans une seule transaction Prisma :

1. **Re-lecture atomique** du compte (idempotence : si déjà anonymisé, retour stable).
2. **Anonymisation du `User`** par `UPDATE` :
   - `email` -> `anonymized-{id}@deleted.invalid` **chiffré** (AES-256-GCM), `emailBlindIndex`
     recalculé sur cette valeur (préserve l'unicité, libère l'ancien email pour une éventuelle
     ré-inscription).
   - `username` -> `deleted-user-{id}` (identifiant public neutre, unicité préservée).
   - `bio` -> `null`, `image` -> `null`.
   - `passwordHash` -> valeur invalide non connue (login désormais impossible).
   - `updatedAt` -> now.
3. **Suppression des données relationnelles** : `Favorite` et `Follow` de l'utilisateur (données
   comportementales sans valeur publique dissociable) sont supprimés.
4. **Conservation dissociée** : `Article` et `Comment` restent, leur `authorId` pointant vers le
   `User` anonymisé.
5. **Écriture de l'audit** `gdpr.erase` **dans la même transaction** (Art. 5(2), voir [04](04-logging-audit-pii-safe.md)).

### Effet sur le jeton

Le JWT reste techniquement valide jusqu'à expiration (stateless, ADR 007), mais il désigne un compte
dont le `passwordHash` est invalidé et les PII effacées ; le front supprime le jeton du
`localStorage` à la confirmation. Le durcissement (révocation) est hors périmètre (voir [08](08-securite-transverse.md)).

### Liste exhaustive des champs anonymisés

Pour garantir qu'aucun champ PII n'est oublié, la liste ci-dessous est **la référence** et fait
l'objet d'un test de non-régression :

- `User.email` (chiffré, valeur neutre), `User.emailBlindIndex` (recalculé)
- `User.username` (pseudonyme neutre)
- `User.bio` -> null, `User.image` -> null
- `User.passwordHash` -> invalidé
- `Favorite` (toutes lignes de l'utilisateur) -> supprimées
- `Follow` (follower et following de l'utilisateur) -> supprimées
- `Article` / `Comment` -> **conservés**, dissociés

## 5. Chemin assisté (hors application)

Pour une demande reçue par email (personne ayant perdu l'accès) :

1. Vérification raisonnable de l'identité (le demandeur prouve le contrôle de l'email).
2. Exécution du script correspondant (`export-user.ts` / `anonymize-user.ts`) par le responsable de
   traitement, sur la base du `userId` résolu via le blind index.
3. Réponse dans le délai légal (un mois, Art. 12(3)).

## 6. Critères d'acceptation

- AC-1 : `GET /api/user/export` renvoie profil, articles, commentaires, favoris, follows de
  l'appelant, et rien d'un tiers.
- AC-2 : l'export contient l'email en clair (déchiffré) et jamais le `passwordHash`.
- AC-3 : `DELETE /api/user` rend l'email irrécupérable (nouvelle valeur neutre chiffrée) et le login
  impossible.
- AC-4 : après anonymisation, les articles et commentaires de la personne existent toujours, rattachés
  à un auteur anonyme ; ses favoris et follows sont supprimés.
- AC-5 : l'opération est idempotente et écrit une entrée d'audit `gdpr.erase` dans la même
  transaction.
- AC-6 : les endpoints RGPD ne sont pas couverts par la suite de conformité RealWorld (aucune
  régression du contrat).
