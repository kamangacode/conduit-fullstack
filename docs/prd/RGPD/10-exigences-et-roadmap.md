# Exigences REQ-PRIV et roadmap

> Traduit le PRD en exigences traçables (proposées pour le domaine `privacy` du référentiel
> `docs/requirements/non-functional/`) et en une roadmap phasée. Ces exigences sont **proposées**
> ici ; leur matérialisation en fichiers `REQ-PRIV-*.md` (avec `acceptance_criteria`,
> `implementation.files/tests`) est un livrable de mise en œuvre, pas du PRD.

## 1. Domaine `privacy` proposé

Le référentiel REQ-as-code n'a aujourd'hui que trois domaines non fonctionnels : `architecture`,
`conformance`, `security` (les REQ-SEC couvrent secrets et injection SQL). Aucun ne porte sur la
protection des données personnelles. Ce PRD propose un domaine **`privacy`** dédié.

## 2. Exigences proposées

| REQ | Titre | Priorité | Article RGPD | Annexe | Item threat-model |
|-----|-------|----------|--------------|--------|-------------------|
| REQ-PRIV-001 | Chiffrement de l'email at-rest avec blind index | must | Art. 32, 25 | [03](03-chiffrement-pii.md) | B5 |
| REQ-PRIV-002 | Masquage PII systématique des logs | must | Art. 5(1)(c) | [04](04-logging-audit-pii-safe.md) | C6 |
| REQ-PRIV-003 | Journal d'audit à acteur pseudonyme | must | Art. 5(2) | [04](04-logging-audit-pii-safe.md) | C6 (T7) |
| REQ-PRIV-004 | Droit d'accès et portabilité (export self-service) | must | Art. 15, 20 | [05](05-droits-des-personnes.md) | — |
| REQ-PRIV-005 | Droit à l'effacement par anonymisation | must | Art. 17 | [05](05-droits-des-personnes.md) | — |
| REQ-PRIV-006 | Politique de rétention et purge auditée | should | Art. 5(1)(e) | [06](06-retention-purge.md) | — |
| REQ-PRIV-007 | TLS imposé sur la connexion base | must | Art. 32 | [07](07-connexion-bdd-et-secrets.md) | — |
| REQ-PRIV-008 | Fail-fast des secrets de conformité sans fuite | must | Art. 32 | [07](07-connexion-bdd-et-secrets.md) | T10 |
| REQ-PRIV-009 | Rate limiting + en-têtes de sécurité HTTP | must | Art. 32 | [08](08-securite-transverse.md) | B8 (T12) |
| REQ-PRIV-010 | Registre Art. 30 et data-mapping tenus à jour | must | Art. 30 | [01](01-registre-traitements-art30.md), [02](02-data-mapping.md) | — |
| REQ-PRIV-011 | Procédure de violation de données (72h) | should | Art. 33, 34 | [09](09-runbook-violation-72h.md) | — |
| REQ-PRIV-012 | Supply-chain : SAST, OSV, SBOM, licences | should | Art. 32 | [08](08-securite-transverse.md) | B7 (T13) |

## 3. Critères d'acceptation (synthèse)

Chaque exigence reprend les critères de son annexe. Exemples de forme Given/When/Then attendue pour
la matérialisation en `REQ-PRIV-*.md` :

- **REQ-PRIV-001** : *Étant donné* un compte enregistré, *quand* on lit la table `users`, *alors*
  aucun email n'apparaît en clair et le login retrouve le compte via le blind index.
- **REQ-PRIV-002** : *Étant donné* un email passé à un logger, *quand* le log est émis en
  production, *alors* l'email apparaît masqué.
- **REQ-PRIV-005** : *Étant donné* un utilisateur authentifié, *quand* il appelle `DELETE /api/user`,
  *alors* son email devient irrécupérable, ses articles restent dissociés, une entrée d'audit est
  écrite dans la même transaction.
- **REQ-PRIV-008** : *Étant donné* une production sans clé de chiffrement, *quand* l'API démarre,
  *alors* elle s'arrête en nommant la variable, sans afficher sa valeur.

## 4. Matrice de traçabilité (mesure -> article -> preuve)

| Mesure | Article | Preuve visée (test / vérif) |
|--------|---------|------------------------------|
| Chiffrement email + blind index | 32, 25 | `SELECT email` ne renvoie que `enc:v1:` ; test unicité + login |
| Masquage logs | 5(1)(c) | test unitaire de masquage par motif ; revue anti-`new Logger` |
| Audit pseudonyme | 5(2) | test transaction erase+audit ; `actorRef` jamais email en clair |
| Export | 15, 20 | test export = données de l'appelant, sans `passwordHash` |
| Anonymisation | 17 | test champs anonymisés + contenu conservé dissocié + idempotence |
| Rétention | 5(1)(e) | test dry-run + plancher 365j + purge auditée |
| TLS BDD | 32 | boot refuse `sslmode` permissif en prod |
| Fail-fast secrets | 32 | boot refuse clé absente/malformée sans afficher la valeur |
| Rate limiting + Helmet | 32 | 429 sur login ; en-têtes présents |
| Registre Art. 30 | 30 | couverture 100 % des modèles du schema |
| Violation 72h | 33, 34 | runbook testé à l'exercice annuel |
| Supply-chain | 32 | gates CI anti-faux-vert |

## 5. Roadmap

### V1 — Conformité de base

Ordre conseillé (les dépendances techniques d'abord) :

1. **Logger PII-safe** (REQ-PRIV-002) : pré-requis de l'audit et de toute la suite.
2. **Chiffrement email + blind index** (REQ-PRIV-001) : passe A, backfill, passe B ([03](03-chiffrement-pii.md) §6).
3. **Journal d'audit** (REQ-PRIV-003) : table `AuditLog` + pseudonymisation.
4. **Droits self-service** (REQ-PRIV-004, 005) : export + anonymisation.
5. **Rétention** (REQ-PRIV-006) : purge audit + script planifié.
6. **Infra** (REQ-PRIV-007, 008) : TLS + fail-fast des nouveaux secrets.
7. **Durcissement applicatif** (REQ-PRIV-009) : rate limiting + Helmet.
8. **Documentation** (REQ-PRIV-010, 011) : registre + runbook (déjà rédigés par ce PRD, à maintenir).

### V2 — Durcissement

- Chiffrement `bio`/`image` (extension REQ-PRIV-001).
- Purge des comptes inactifs par anonymisation (REQ-PRIV-006 §V2).
- Supply-chain complète : SAST + OSV + SBOM + licences (REQ-PRIV-012).
- Politique de confidentialité publique + DPIA si le traitement évolue.
- Durcissement du jeton (expiration courte + rotation, threat-model T1).

## 6. Suites

- Créer le domaine `privacy` et matérialiser REQ-PRIV-001 à 012 dans
  `docs/requirements/non-functional/privacy/` (frontmatter Zod, `pnpm verify-requirements`).
- À chaque exigence livrée : renseigner `implementation.files/tests`, passer `status: implemented`,
  et mettre à jour la matrice STRIDE du [threat-model](../../security/threat-model.md).
- Créer les ADR des décisions structurantes (chiffrement + blind index ; anonymisation vs
  suppression ; audit pseudonyme) dans `docs/adr/`.
