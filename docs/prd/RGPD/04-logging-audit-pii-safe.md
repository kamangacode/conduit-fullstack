# Logging PII-safe et journal d'audit

> Spécifie le logger structuré avec masquage automatique des PII (Art. 5(1)(c), minimisation) et
> le journal d'audit des actions sensibles (Art. 5(2), responsabilité). Réalise l'item **C6** du
> [threat-model](../../security/threat-model.md).

## 1. État actuel

Le projet n'a **aucun logger structuré** aujourd'hui : la seule sortie est un `console.error` au
boot (`main.ts`), volontairement écrit pour ne jamais réafficher une valeur de configuration. Il
n'existe donc rien à masquer pour l'instant, mais rien non plus pour le jour où des logs
applicatifs arriveront. Le [threat-model](../../security/threat-model.md) le note explicitement :
masquage PII (T8) et journal d'audit (T7) prévus avec le logger (item C6). Ce PRD fait de ce logger
un pré-requis, conçu masquant dès le départ.

## 2. Logger PII-safe

### Règle absolue

Tout code d'`apps/api` obtient son logger via une fabrique unique `getLogger(scope)`, qui renvoie
un logger enveloppant (masquant). L'usage direct d'un logger natif non masquant (`new Logger(...)`
de `@nestjs/common`, ou `console.*` hors boot) est **proscrit** et vérifié en revue :
`rg "\bnew Logger\(|console\.(log|info|warn|error)\(" apps/api/src` ne doit remonter que les
exceptions documentées (le boot de `main.ts`). Un verrou lint pourra formaliser cette règle en V2.

### Masquage automatique

Le wrapper masque chaque argument (string, objet sérialisé, et `Error.message` / `Error.stack`)
avant émission :

| Donnée | Détection | Masquage | Statut |
|--------|-----------|----------|--------|
| Email | regex email | garder 2 premiers caractères du local + domaine (`he***@example.com`) | auto V1 |
| Jeton JWT | motif `Token <jwt>` / triplet base64url séparé de points | remplacer par `Token ***` | auto V1 |
| IPv4 | regex avec limites de mots (anti faux positifs sur numéros de version) | garder le /16 (`203.0.113.7` -> `203.0.*.*`) | auto V1 |
| `passwordHash` | clé d'objet connue | remplacer par `***` | auto V1 |
| Nom, adresse, IPv6 | trop de faux positifs pour l'auto | helpers explicites au call-site | manuel |

- **`LOG_PII_UNMASKED=1`** : bypass réservé au debug local. Une assertion au boot **interrompt le
  démarrage** si `NODE_ENV=production` et `LOG_PII_UNMASKED=1` (le débogage en clair ne doit jamais
  atteindre la production).
- **Query-log Prisma** : `log: ['query']` **interdit** hors développement local. En production, les
  paramètres de requête (donc l'email chiffré, et pire, tout paramètre non chiffré) ne doivent pas
  transiter par les logs, que le wrapper n'intercepte pas pour les logs natifs du driver.

### Placement

- Adapter d'infrastructure `apps/api/src/infrastructure/logging/` : `pii-safe-logger.ts`,
  `get-logger.ts`, `assert-pii-config.ts`. Les fonctions de masquage réutilisables vivent dans un
  module partagé (`domain/shared/pii.ts` côté crmcoaching ; équivalent à créer ici) et sont testées
  unitairement (chaque motif : masqué / non altéré quand ce n'est pas une PII).

## 3. Journal d'audit (Art. 5(2))

### Modèle

Ajouter une table `AuditLog` (voir [02-data-mapping.md](02-data-mapping.md)) :

```prisma
model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  actorRef  String   // pseudonyme : userId (UUID) ou HMAC de l'email si acteur sans compte
  action    String   // ex. gdpr.export, gdpr.erase, auth.login.failed
  metadata  Json?    // non-PII uniquement (compteurs, codes HTTP, jamais d'email en clair)
  createdAt DateTime @default(now())

  @@index([actorRef])
  @@index([action, createdAt])
  @@map("audit_logs")
}
```

### Principes

- **Acteur pseudonyme, jamais l'email en clair.** Pour un utilisateur inscrit, `actorRef = userId`
  (déjà un UUID pseudonyme). Pour un acteur sans compte (ex. tentative de login sur un email
  inexistant), `actorRef = HMAC-SHA256(email, GDPR_HMAC_SECRET)`. Le secret `GDPR_HMAC_SECRET`
  (min 16 caractères, validé au boot) permet, à qui le détient, de recalculer le hash pour retrouver
  les actions liées à un email, sans jamais stocker l'email.
- **Atomicité effacement + preuve.** L'entrée d'audit `gdpr.erase` est écrite **dans la même
  transaction Prisma** que l'anonymisation ([05](05-droits-des-personnes.md)) : impossible d'avoir
  une preuve sans effacement, ni un effacement sans preuve.
- **Rétention à plancher.** L'`AuditLog` est conservé au minimum 365 jours ([06](06-retention-purge.md)),
  et la borne basse est **verrouillée** : un opérateur ne peut pas réduire la rétention pour effacer
  des traces (garde-fou Art. 5(2)).

### Actions journalisées (V1)

| Action | Déclencheur | metadata (non-PII) |
|--------|-------------|--------------------|
| `gdpr.export` | Export self-service ([05](05-droits-des-personnes.md)) | nombre d'entités exportées |
| `gdpr.erase` | Anonymisation self-service | champs anonymisés (compte), articles/commentaires dissociés (compteurs) |
| `auth.login.failed` | Échec de connexion | code, `actorRef` = HMAC email tenté |
| `retention.run` | Passage de purge ([06](06-retention-purge.md)) | compteurs par catégorie |

> Distinction importante avec crmcoaching : le REQ-NFR-001 de crmcoaching décrit un *hash
> d'intégrité par entrée* (chaînage SHA-256), tandis que l'implémentation réelle est une
> *pseudonymisation de l'acteur* (HMAC email). Ce PRD retient la **pseudonymisation** (utile et
> réaliste pour Conduit) et laisse le hash-chaîné d'intégrité en option V2 (colonne `hash` +
> vérification), si un besoin d'inviolabilité forte du journal apparaît.

## 4. Observabilité liée à la conformité

- **Error reporting** : si un outil type Sentry est ajouté, il doit hériter du masquage (les
  messages et stacks passent par le wrapper avant envoi ; `beforeSend` filtre les champs connus).
  Aucun DSN ne doit envoyer de PII en clair à un tiers.
- **Health / SLO** : les endpoints de santé et les métriques ([../../sre/slos.yaml](../../sre/slos.yaml))
  n'exposent aucune donnée personnelle (compteurs et états uniquement).

## 5. Critères d'acceptation

- AC-1 : un email passé à `logger.info(...)` apparaît masqué (`he***@…`) dans la sortie.
- AC-2 : un `Error` dont le message contient un email est logué masqué (message et stack).
- AC-3 : en production, démarrer avec `LOG_PII_UNMASKED=1` interrompt le boot.
- AC-4 : `gdpr.erase` écrit l'entrée d'audit dans la même transaction que l'anonymisation (test
  d'intégration : un rollback de la transaction annule les deux).
- AC-5 : `actorRef` d'un `auth.login.failed` n'est jamais un email en clair (c'est un HMAC).
- AC-6 : la revue échoue si un `new Logger(...)` non masquant est introduit hors exceptions.
