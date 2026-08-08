# Connexion base de données et gestion des secrets

> Sécurité du traitement au niveau infrastructure (Art. 32) : chiffrement en transit vers la base,
> gestion des connexions, et validation fail-fast des secrets de conformité au démarrage.

## 1. État actuel

- Datasource Prisma (`apps/api/prisma/schema.prisma:18-21`) : `provider = "postgresql"`,
  `url = env("DATABASE_URL")`. Aucun `sslmode`, aucun paramètre de pool.
- `PrismaService` (`apps/api/src/infrastructure/prisma/prisma.service.ts`) : `super({ datasourceUrl:
  env.DATABASE_URL })`, `$connect()` explicite en `onModuleInit` (readiness fail-fast),
  `$disconnect()` en `onModuleDestroy`. Point d'instanciation unique du `PrismaClient`.
- `DATABASE_URL` de dev : `postgresql://conduit:conduit@localhost:5432/conduit_dev?schema=public`,
  sans TLS.
- `DATABASE_URL` est validée au boot (`config/env.ts` : doit commencer par `postgresql://`).

Le socle est sain (fail-fast, instanciation unique). Manquent : TLS imposé en production, pooling
explicite, et l'intégration des secrets de conformité au fail-fast existant.

## 2. TLS en transit (ENF-3)

- **Cible** : la connexion à PostgreSQL en production impose TLS. Minimum `sslmode=require` ;
  cible `sslmode=verify-full` (vérifie le certificat serveur, protège contre le MITM).
- **Mise en œuvre** : le paramètre transite par `DATABASE_URL`
  (`postgresql://user:pass@host:5432/db?sslmode=verify-full`). Le PaaS managé (région UE) fournit un
  endpoint TLS ; `verify-full` peut nécessiter la CA du fournisseur (`sslrootcert`).
- **Renforcement de la validation** : étendre le schéma Zod `config/env.ts` pour **exiger un
  `sslmode` non permissif** quand `NODE_ENV=production` (refuser `disable`/`allow`/`prefer`), sans
  jamais réafficher l'URL dans le message d'erreur.
- **Chiffrement at-rest** : assuré par la plateforme (PostgreSQL managé en région UE, volumes et
  sauvegardes chiffrés). Documenté dans le [registre Art. 30](01-registre-traitements-art30.md).

## 3. Gestion des connexions

- **Pooling** : fixer explicitement une limite adaptée à la plateforme via le paramètre
  `connection_limit` de `DATABASE_URL` (Prisma 6 lit les paramètres de pool depuis l'URL), ou
  interposer un pooler (PgBouncer) si l'hébergement le recommande. Éviter le défaut implicite en
  production (dimensionnement non maîtrisé).
- **Timeouts** : `connect_timeout` raisonnable pour un fail-fast propre au démarrage.
- **Instanciation unique** : conserver l'unique `PrismaClient` (pas de pools multiples), déjà en
  place via `PrismaService`.

## 4. Secrets de conformité et fail-fast (ENF-2)

Le PRD ajoute des secrets. Ils rejoignent la discipline fail-fast existante de `config/env.ts` :
validation au boot, message nommant la variable, **jamais** de réaffichage de la valeur (testé par
`env.spec.ts`).

### Variables ajoutées

| Variable | Format | Requis en prod | Rôle |
|----------|--------|----------------|------|
| `FIELD_ENCRYPTION_KEY` | 32 octets base64 | Oui | Chiffrement email ([03](03-chiffrement-pii.md)) |
| `EMAIL_BLIND_INDEX_KEY` | 32 octets base64 | Oui | Blind index email ([03](03-chiffrement-pii.md)) |
| `GDPR_HMAC_SECRET` | ≥ 16 caractères | Oui | Pseudonymisation acteur audit ([04](04-logging-audit-pii-safe.md)) |
| `FIELD_ENCRYPTION_STRICT` | `true` / `false` | Oui (post-backfill) | Mode strict du chiffrement ([03](03-chiffrement-pii.md)) |
| `LOG_PII_UNMASKED` | `1` / absent | Interdit en prod | Debug local du masquage ([04](04-logging-audit-pii-safe.md)) |
| `RETENTION_AUDIT_LOG_DAYS` | entier 365-730 | défaut 365 | Rétention audit ([06](06-retention-purge.md)) |

### Règles de validation au boot

- Clés `*_KEY` : décoder la base64 et **exiger 32 octets** ; échec = arrêt (message sans valeur).
- `GDPR_HMAC_SECRET` : longueur minimale ; échec = arrêt.
- `LOG_PII_UNMASKED=1` **et** `NODE_ENV=production` : arrêt ([04](04-logging-audit-pii-safe.md)).
- En `development`/`test` : des stubs 32 octets sont acceptés pour permettre les tests DB-free.

### `.env.example`

Toutes ces variables sont documentées et commentées dans `apps/api/.env.example` (avec des valeurs
d'exemple synthétiques, jamais de vrai secret : garde-fou `no-env-files` + `secret-guard.sh`).

## 5. Rotation et sauvegarde des secrets (ENF-7)

- **Sauvegarde** : clés stockées dans le gestionnaire de secrets de la plateforme (prod + preview)
  **et** dans un coffre hors dépôt. Owner désigné. Perte de `FIELD_ENCRYPTION_KEY` = données email
  illisibles définitivement ([03](03-chiffrement-pii.md)).
- **Rotation** :
  - `JWT_SECRET` / `GDPR_HMAC_SECRET` : rotation possible, impact limité (jetons à ré-émettre ;
    l'ancien secret HMAC empêche de recalculer les anciens `actorRef`, à documenter).
  - `FIELD_ENCRYPTION_KEY` : rotation via re-chiffrement par batch (`enc:v1:` -> `enc:v2:`).
  - `EMAIL_BLIND_INDEX_KEY` : rotation = recalcul de toute la colonne `emailBlindIndex` (migration
    dédiée).
  - Génération : `openssl rand -base64 32` (clés), `openssl rand -hex 32` (JWT).
- **Fréquence** : sur compromission, rotation immédiate ; sinon revue périodique (12 mois).

## 6. Critères d'acceptation

- AC-1 : en production, une `DATABASE_URL` sans `sslmode` sûr interrompt le boot.
- AC-2 : démarrer sans une clé de conformité requise interrompt le boot en nommant la variable, sans
  l'afficher.
- AC-3 : `apps/api/.env.example` liste et commente toutes les nouvelles variables, sans vrai secret.
- AC-4 : un seul `PrismaClient` est instancié (pas de pools multiples).
