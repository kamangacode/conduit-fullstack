# PRD Conformité RGPD — Conduit

> Product Requirements Document pour la mise en conformité RGPD de conduit-fullstack.
> Ce dossier spécifie **quoi** construire et **pourquoi**, article du RGPD par article,
> en s'appuyant sur l'implémentation de référence du projet crmcoaching (CRM pour coachs)
> adaptée aux contraintes propres à Conduit (contrat RealWorld, JWT stateless, contenu public).

## Résumé exécutif

conduit-fullstack traite des données personnelles (a minima l'email et le contenu généré par
les utilisateurs) sans que la conformité RGPD soit aujourd'hui outillée : l'email est stocké en
clair, il n'existe ni journal d'audit, ni politique de rétention, ni procédure d'exercice des
droits des personnes, ni registre des traitements. Ce PRD comble ce gap en portant la sécurité
et la conformité comme des exigences **by design**, dans chaque couche, plutôt qu'ajoutées après
coup.

Le socle existant est solide et sert de point d'appui : authentification argon2id, JWT `jose`
signé avec `alg` épinglé et `sub` sans PII, configuration fail-fast sans réafficher les valeurs,
anti-IDOR en 404, autorité côté serveur, garde-fous secrets (pre-commit + TruffleHog CI) et
verrou anti-SQL-brut. Le PRD capitalise dessus au lieu de le refaire.

## Décisions de cadrage retenues

| Décision | Choix | Raison |
|----------|-------|--------|
| Droit à l'effacement (Art. 17) | **Anonymisation** (dissociation de l'auteur, conservation des contenus publics) | `onDelete: Cascade` détruirait articles et commentaires publics ; l'anonymisation préserve l'intégrité des fils de discussion |
| Périmètre de chiffrement PII V1 | **Email seul** (AES-256-GCM + blind index) | Minimal, aligné sur la note du `schema.prisma` (item B5). `bio`/`image` sont affichés publiquement (faible valeur d'un chiffrement at-rest) : traités en V2 |
| Exercice des droits | **Self-service** sur le compte authentifié | Conduit n'a ni rôle admin ni RBAC ; la personne concernée est l'utilisateur authentifié lui-même (identité prouvée par le JWT) |
| Livrable | **PRD complet** : conformité + design technique + exigences + roadmap phasée | Demande explicite « le plus complet possible » |

## Structure du dossier

| Fichier | Contenu | Articles RGPD |
|---------|---------|---------------|
| [00-prd-rgpd.md](00-prd-rgpd.md) | PRD principal : contexte, objectifs, rôles, exigences, périmètre, phasage | transverse |
| [01-registre-traitements-art30.md](01-registre-traitements-art30.md) | Registre des activités de traitement | Art. 30 |
| [02-data-mapping.md](02-data-mapping.md) | Cartographie des PII par modèle Prisma | Art. 30, Art. 5 |
| [03-chiffrement-pii.md](03-chiffrement-pii.md) | Chiffrement email at-rest (AES-256-GCM) + blind index, gestion de clés, migration | Art. 32, Art. 25 |
| [04-logging-audit-pii-safe.md](04-logging-audit-pii-safe.md) | Logger structuré avec masquage PII + journal d'audit | Art. 5(1)(c), Art. 5(2) |
| [05-droits-des-personnes.md](05-droits-des-personnes.md) | Accès, portabilité, rectification, effacement (self-service) | Art. 15/16/17/20 |
| [06-retention-purge.md](06-retention-purge.md) | Politique de rétention et purge automatique | Art. 5(1)(e) |
| [07-connexion-bdd-et-secrets.md](07-connexion-bdd-et-secrets.md) | TLS/`sslmode`, pooling, gestion des secrets, fail-fast | Art. 32 |
| [08-securite-transverse.md](08-securite-transverse.md) | RBAC, anti-IDOR, rate limiting, en-têtes HTTP, supply-chain | Art. 32 |
| [09-runbook-violation-72h.md](09-runbook-violation-72h.md) | Procédure de notification de violation de données | Art. 33/34 |
| [10-exigences-et-roadmap.md](10-exigences-et-roadmap.md) | Exigences REQ-PRIV proposées + roadmap V1/V2 | transverse |

## Méthode

- **Docs-as-code** : chaque fichier vit dans le dépôt, versionné, relu comme du code, mis à jour
  au même rythme que le schéma de données. Le `schema.prisma` reste la source de vérité de la
  cartographie ([02-data-mapping.md](02-data-mapping.md)).
- **Traçabilité** : chaque mesure est rattachée à un article du RGPD et, à terme, à un
  REQ-PRIV-* du référentiel `docs/requirements/non-functional/privacy/` (voir
  [10-exigences-et-roadmap.md](10-exigences-et-roadmap.md)).
- **Gate de revue** : tout ajout ou modification d'un champ PII dans le `schema.prisma` doit
  mettre à jour [02-data-mapping.md](02-data-mapping.md) puis le registre
  [01-registre-traitements-art30.md](01-registre-traitements-art30.md) **avant** la PR.

## Références

- Implémentation de référence : projet crmcoaching (`docs/compliance/`, `docs/runbooks/`,
  ADR 017/019/020/029/030/031/032/033).
- État actuel : [../../security/threat-model.md](../../security/threat-model.md) (STRIDE, items
  de roadmap B5/B8/C6 cités par ce PRD), [../../adr/007-authentification-argon2id-jose.md](../../adr/007-authentification-argon2id-jose.md),
  [../../adr/024-verrou-sql-brut-plugin-biome.md](../../adr/024-verrou-sql-brut-plugin-biome.md).
- Cadre légal : Règlement (UE) 2016/679 (RGPD), Loi Informatique et Libertés, lignes directrices CNIL.
