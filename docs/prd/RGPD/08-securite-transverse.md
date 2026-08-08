# Sécurité transverse

> Mesures de sécurité qui protègent les données personnelles au niveau applicatif et de la chaîne
> d'approvisionnement (Art. 32). Distingue ce qui est **déjà couvert** de ce qui est **à ajouter**.

## 1. Contrôle d'accès (déjà couvert, à maintenir)

- **Anti-IDOR en 404, pas 403** : une ressource non possédée renvoie `404` pour ne pas confirmer son
  existence (threat-model T4, tests `conformance/hurl/errors_authorization.hurl`). À préserver sur
  toute nouvelle route.
- **Autorité côté serveur** : l'attribution (`authorId`) est dérivée du JWT, jamais d'un champ client
  (threat-model T3, R-6). Les endpoints RGPD ([05](05-droits-des-personnes.md)) agissent uniquement
  sur `request.user.id`, ce qui exclut par construction tout accès à un tiers.
- **Validation Zod en frontière** : rejet `422` avant tout accès base (T5).
- **Pas de RBAC aujourd'hui** : Conduit n'a pas de rôle admin. Si un rôle privilégié est introduit
  plus tard (ex. modération), appliquer le pattern éprouvé de crmcoaching : un garde de rôle
  **couplé** au décorateur (un décorateur de rôle seul, sans garde enregistré, est un no-op
  silencieux). À défaut, ce PRD ne présume aucun endpoint admin.

## 2. Rate limiting et en-têtes de sécurité (à ajouter, item B8 / T12)

Aujourd'hui absents (threat-model T12, menace acceptée). Le PRD les requiert car ils protègent
directement les comptes et les PII :

- **Rate limiting** : `@nestjs/throttler` global, avec une limite **resserrée sur les routes
  d'authentification** (`POST /api/users`, `POST /api/users/login`) pour contrer le brute-force de
  mot de passe (protège l'accès aux comptes). Réponse `429` + `Retry-After`. Le tracker doit
  utiliser l'IP réelle du client (`trust proxy` correctement configuré derrière le PaaS).
- **En-têtes HTTP** : Helmet dans `main.ts` avec CSP (`default-src 'self'`), **HSTS**
  (`max-age` long, `includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`
  restrictif.
- **CORS** : déjà piloté par `CORS_ORIGIN` validé (T11) ; conserver l'allowlist explicite.

## 3. Jeton et front (durcissement noté, hors périmètre V1)

- Le JWT est stateless, stocké en `localStorage` (ADR 012) : une faille XSS permettrait le vol du
  jeton (threat-model T1). Le durcissement recommandé (expiration courte + rotation de jeton, voire
  passage à un cookie `HttpOnly`) est **hors périmètre** de ce PRD mais listé comme suite. La CSP
  (§2) réduit la surface XSS entre-temps.
- Atténuation en place : le JWT ne contient que `sub` (pas de PII), et `AuthGuard` re-résout le
  compte en base (un jeton désignant un compte anonymisé/supprimé est rejeté).

## 4. Sécurité SQL (déjà couvert)

- Requêtes **Prisma paramétrées** exclusivement. `$queryRawUnsafe` / `$executeRawUnsafe` interdits
  par le verrou lint GritQL Biome ([ADR 024](../../adr/024-verrou-sql-brut-plugin-biome.md)), vérifié
  activement par `scripts/verify-sql-raw-guard.sh` (contrôle du contrôle inclus). À maintenir.

## 5. Secrets et chaîne d'approvisionnement

### Déjà couvert

- **Pre-commit** (`lefthook.yml`) : `no-env-files` (bloque tout `.env` porteur de secrets),
  `secret-guard.sh` (5 familles de secrets), vérifiés activement par `verify-secret-guard.sh`
  (REQ-SEC-001).
- **CI** : TruffleHog `--only-verified` sur la plage poussée (REQ-SEC-003), précédé de
  `verify-secret-scan.sh` (distingue « 0 trouvé » de « rien scanné »). `pnpm audit --prod
  --audit-level=high`. `onlyBuiltDependencies` (blocage des scripts post-install). Dependabot groupé
  (ADR 003).

### À ajouter (item B7 / T13)

| Mesure | Rôle | Gate |
|--------|------|------|
| SAST (CodeQL ou Semgrep OSS) | Détecter les patterns vulnérables (injection, crypto faible) | Bloquant sur sévérité élevée |
| OSV-Scanner | Vulnérabilités des dépendances (au-delà de `pnpm audit`) | Bloquant sur high/critical (CVSS ≥ 7) |
| SBOM (CycloneDX / syft) | Inventaire des composants, traçabilité supply-chain | Artefact publié |
| License check | Éviter une licence incompatible entrant par une dépendance | Bloquant sur allowlist |

- Les gates doivent être **anti-faux-vert** (échouer si le scanner n'a rien analysé), sur le modèle
  des vérifications actives existantes (`verify-*.sh`).
- Actions CI **pinnées par SHA**.

## 6. Alignement avec le threat-model

Ce PRD referme les items ouverts du [threat-model](../../security/threat-model.md) liés aux données
personnelles :

| Item threat-model | Statut visé après ce PRD |
|-------------------|--------------------------|
| B5 (chiffrement email at-rest) | Couvert ([03](03-chiffrement-pii.md)) |
| C6 (masquage PII logs + audit) | Couvert ([04](04-logging-audit-pii-safe.md)) |
| B8 (Helmet/CSP + rate limiting) | Couvert (§2) |
| B7 (SBOM + OSV + SAST) | Couvert (§5) |
| T1 (durcissement jeton) | Noté, hors périmètre (§3) |

Après implémentation, mettre à jour la matrice STRIDE (passer les mentions « prévu (item X) » à
« couvert »).

## 7. Critères d'acceptation

- AC-1 : un excès de requêtes sur `login` renvoie `429` + `Retry-After`.
- AC-2 : les réponses portent les en-têtes Helmet (CSP, HSTS, nosniff).
- AC-3 : le verrou SQL brut et les garde-fous secrets restent verts et échouent sous sabotage.
- AC-4 : la CI comprend un SAST, un OSV-Scanner, un SBOM et un license check, tous anti-faux-vert.
- AC-5 : le threat-model est mis à jour (items B5/C6/B8/B7 passés à « couvert »).
