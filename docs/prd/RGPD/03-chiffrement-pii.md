# Chiffrement de l'email at-rest et blind index

> Spécification technique du chiffrement de l'email (AES-256-GCM) et du blind index (HMAC-SHA256)
> qui préserve l'unicité et le lookup. Article 32 (sécurité du traitement), Article 25 (privacy by
> design). Réalise l'item **B5** du [threat-model](../../security/threat-model.md).

## 1. Problème à résoudre

L'email est aujourd'hui en clair dans `users.email` (schema.prisma:28). Une fuite de la base
l'exposerait directement. Le chiffrer naïvement casse deux propriétés dont l'application dépend :

1. **Unicité** (`@unique`) : un chiffrement authentifié GCM est **non déterministe** (IV aléatoire),
   donc deux chiffrés du même email diffèrent. La contrainte SQL d'unicité ne s'applique plus.
2. **Lookup au login** : `findByEmail(email)` ne peut plus faire un `WHERE email = ?` sur une valeur
   chiffrée non déterministe.

La solution est un **blind index** : une empreinte déterministe et secrète de l'email, stockée dans
une colonne indexée à part, qui porte l'unicité et le lookup exact, tandis que la valeur chiffrée
(réversible) porte la donnée.

## 2. Chiffrement de champ (AES-256-GCM)

- **Algorithme** : AES-256-GCM (chiffrement authentifié : confidentialité + intégrité).
- **Format de payload stocké** : `enc:v1:{iv_hex}:{tag_hex}:{ciphertext_hex}`.
  - Préfixe versionné `enc:v1:` : permet une rotation de schéma ou de clé sans ambiguïté.
  - `iv` : 12 octets aléatoires (`randomBytes(12)`), **frais à chaque chiffrement**, jamais réutilisé.
  - `tag` : tag d'authentification GCM **épinglé à 16 octets** (`authTagLength: 16`) au chiffrement
    **et** au déchiffrement, pour que Node rejette un tag tronqué fourni par un attaquant.
  - Regex de validation : `^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$`.
- **AAD (Additional Authenticated Data) contextuel** : `user:email`. L'AAD lie le chiffré à sa
  colonne : recopier un chiffré `user:email` ailleurs ferait échouer le déchiffrement (tag GCM
  invalide). Coût de stockage nul. (Utile dès qu'on chiffrera d'autres champs en V2 : `user:bio`.)
- **Idempotence** : un helper `isEncrypted(value)` détecte le préfixe pour ne jamais rechiffrer.

### Mode strict

- `FIELD_ENCRYPTION_STRICT` (`'true'` / `'false'`).
  - `false` (pendant la migration) : lecture **passthrough** des valeurs non préfixées (données
    historiques encore en clair tolérées en lecture).
  - `true` (après backfill) : toute valeur lue sans préfixe `enc:v1:` lève une erreur explicite,
    fermant le canal plaintext.

## 3. Blind index (HMAC-SHA256)

- **Colonne** : `User.emailBlindIndex String @unique` (à ajouter au schema, remplace de fait
  l'unicité portée par `email`).
- **Calcul** : `HMAC-SHA256(normalize(email), EMAIL_BLIND_INDEX_KEY)`, où `normalize` =
  `email.trim().toLowerCase()`. Sortie hex 64 caractères.
- **Propriétés** :
  - Déterministe et secret : même email = même index, mais impossible à recalculer sans la clé.
  - Lookup exact O(1) : `findByEmail` fait `WHERE emailBlindIndex = HMAC(email)` sans déchiffrer.
  - Unicité : la contrainte `@unique` sur `emailBlindIndex` remplace celle sur `email`.
- **Pas de recherche partielle** exposée (un `LIKE` sur email chiffré est impossible, et c'est
  voulu : Conduit n'a pas de recherche admin par email).

## 4. Gestion des clés

| Clé | Env var | Format | Rôle |
|-----|---------|--------|------|
| Clé de chiffrement de champ | `FIELD_ENCRYPTION_KEY` | 32 octets, encodés base64 | Chiffre/déchiffre l'email |
| Clé du blind index | `EMAIL_BLIND_INDEX_KEY` | 32 octets, encodés base64 | Dérive l'empreinte déterministe |

- **Clés distinctes** : profils d'exposition et de rotation différents (l'index est sur le chemin
  chaud du login ; la clé de chiffrement protège la donnée au repos). Ne jamais réutiliser l'une pour
  l'autre.
- **Génération** : `openssl rand -base64 32`.
- **Validation au boot** : un helper décode la base64 et **lève une erreur si** la clé est absente,
  mal encodée, ou de longueur décodée différente de 32 octets. Message d'erreur **sans réafficher la
  valeur** (aligné sur le principe de `config/env.ts`).
- **Fail-fast production** : en `NODE_ENV=production`, l'absence de `FIELD_ENCRYPTION_KEY` ou
  `EMAIL_BLIND_INDEX_KEY` empêche `main.ts` de démarrer (voir [07](07-connexion-bdd-et-secrets.md)).
  En `development`/`test`, des stubs 32 octets sont tolérés.
- **Sauvegarde (ENF-7)** : les clés sont stockées dans le gestionnaire de secrets de la plateforme
  (env prod + preview) **et** dans un coffre hors dépôt (gestionnaire de mots de passe). Owner
  désigné. **Perte de clé = données définitivement illisibles** (aucun recovery) : la sauvegarde
  n'est pas optionnelle.
- **Rotation** : le préfixe `enc:v1:` prépare une rotation vers `enc:v2:` (re-chiffrement par batch,
  même mécanique que le backfill §6). Le blind index change si `EMAIL_BLIND_INDEX_KEY` tourne : une
  rotation d'index impose un recalcul de toute la colonne dans une migration dédiée.

## 5. Placement dans l'architecture hexagonale

- **Port (domaine)** : `FieldEncryptionPort` (`apps/api/src/domain/...`), interface pure
  (`encrypt(value, aad)`, `decrypt(value, aad)`), sans dépendance à Node `crypto`. Le domaine reste
  pur et testable sans cryptographie réelle (mock du port).
- **Adapter (infrastructure)** : `FieldEncryptionService` (Node `crypto`) implémente le port.
  Un `EmailBlindIndexService` calcule l'empreinte.
- **Câblage** : le repository `PrismaUserRepository`
  (`apps/api/src/infrastructure/persistence/prisma-user.repository.ts`) chiffre l'email et calcule
  le blind index **avant** l'écriture (`create`, `update`), et déchiffre de façon transparente à la
  lecture. `findByEmail` route sur `emailBlindIndex`.
- Le use-case `RegisterUserUseCase` reste inchangé côté domaine : le commentaire existant « testable
  sans cryptographie » demeure vrai, la crypto vivant dans l'adapter.

## 6. Migration sans downtime (backfill)

Migration en **deux passes**, inspirée du runbook `encrypt-existing-data` de crmcoaching.

### Passe A (livrable 1, réversible)

1. Migration Prisma : ajouter `emailBlindIndex String?` (nullable, temporairement), garder `email`.
2. Câbler `FieldEncryptionService` + `EmailBlindIndexService` ; toutes les **écritures** passent par
   eux ; `FIELD_ENCRYPTION_STRICT=false` (lecture passthrough des données en clair historiques).
3. Déployer. À ce stade, les nouveaux comptes sont chiffrés, les anciens encore en clair.

### Script de backfill

- Fichier : `apps/api/prisma/scripts/encrypt-existing-emails.ts`.
- Exécuté depuis un poste sûr, pointant sur la BDD de prod via `DATABASE_URL` + les deux clés.
- Modes `--dry-run` puis `--apply`.
- Traite par **batches** (ex. 100 lignes) ; chaque ligne en **UPDATE atomique** (email chiffré +
  `emailBlindIndex` dans le même statement, jamais d'état intermédiaire).
- **Idempotent** : clause `WHERE` sélectionnant les lignes non chiffrées ou `emailBlindIndex IS NULL`,
  donc reprend sans doublon après interruption.

### Passe B (livrable 2, verrouillage)

1. Vérifier qu'il ne reste **aucune** ligne en clair et **aucun** `emailBlindIndex` nul.
2. Migration : `emailBlindIndex String @unique NOT NULL` ; retirer l'unicité de `email`.
3. Passer `FIELD_ENCRYPTION_STRICT=true` (ferme le passthrough lecture).
4. **Soak window** 24 à 48 h : surveiller les erreurs de format / de déchiffrement / de tag GCM.

### Rollback

Avant la passe B, revert de la passe A suffit (les lectures restaient passthrough). Après la passe B,
repasser `FIELD_ENCRYPTION_STRICT=false` rétablit la lecture ; un vrai retour au plaintext nécessite
un `decrypt-existing-emails.ts` (hors périmètre V1).

## 7. Périmètre V2

- Chiffrer `bio` (AAD `user:bio`) et `image` (AAD `user:image`). Compromis à réévaluer : ces champs
  sont affichés publiquement, donc leur valeur at-rest est faible ; l'intérêt principal serait une
  fuite de dump où même les champs publics resteraient chiffrés.
- Rotation de clé (`enc:v2:`) documentée et testée.

## 8. Critères d'acceptation

- AC-1 : après migration, `SELECT email FROM users` ne renvoie que des valeurs préfixées `enc:v1:`.
- AC-2 : `register` refuse un email déjà pris (unicité portée par `emailBlindIndex`).
- AC-3 : `login` retrouve l'utilisateur par email (via blind index) et renvoie l'email en clair dans
  la réponse (contrat RealWorld préservé).
- AC-4 : recopier un chiffré `user:email` dans une autre colonne chiffrée fait échouer le
  déchiffrement (AAD).
- AC-5 : en production, démarrer sans `FIELD_ENCRYPTION_KEY` ou `EMAIL_BLIND_INDEX_KEY` interrompt le
  boot avec un message nommant la variable, sans l'afficher.
- AC-6 : le backfill est idempotent (rejouer `--apply` ne modifie plus rien).
