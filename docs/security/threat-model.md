# Modèle de menaces — Conduit (STRIDE)

> Analyse structurée des menaces, réalisée en conception plutôt qu'après incident.
> Chaque menace est classée par catégorie **STRIDE** (Spoofing, Tampering,
> Repudiation, Information disclosure, Denial of service, Elevation of privilege) et
> associée à sa mitigation *réelle dans ce dépôt* (ou, si la mitigation est prévue mais
> pas encore livrée, à l'item de roadmap correspondant).

## Périmètre & actifs

L'application expose une API REST (`apps/api`, NestJS hexagonal) et un front
(`apps/web`, Next.js) autour de trois agrégats : **utilisateurs/profils**,
**articles** (avec favoris et tags) et **commentaires**. Les actifs à protéger :

- **identifiants** (mot de passe, jeton JWT) ;
- **intégrité de l'attribution** (un article/commentaire appartient à son auteur) ;
- **données personnelles** (email de l'utilisateur) ;
- **disponibilité** de l'API publique.

Frontières de confiance : navigateur → API (réseau public), API → PostgreSQL (réseau
privé). Toute donnée venant du navigateur est *non fiable* jusqu'à validation
serveur.

## Matrice STRIDE

| # | Menace | STRIDE | Composant | Mitigation (état) |
|---|--------|--------|-----------|-------------------|
| T1 | Vol / rejeu d'un jeton pour usurper un utilisateur | **S**poofing | Auth | JWT signé (`jose`, HS256, `alg` épinglé — [`jose-token.service.ts`](../../apps/api/src/infrastructure/security/jose-token.service.ts)), secret validé au boot. *Durcissement prévu : expiration courte + rotation.* |
| T2 | Devinette de mot de passe par brute force / fuite de base | **S** / **I** | Auth | Hachage **argon2id** ([`argon2-password-hasher.ts`](../../apps/api/src/infrastructure/security/argon2-password-hasher.ts)), jamais de mot de passe en clair (`User.passwordHash`). |
| T3 | Modification d'un article/commentaire d'un autre auteur | **T**ampering | Articles / Commentaires | **Autorité côté serveur** : la propriété est vérifiée en base (filtrage par `authorId`), jamais depuis un champ du client. Règle R-6 (suppression de commentaire réservée à l'auteur). |
| T4 | Accès à une ressource d'autrui par énumération d'ID (IDOR) | **E**levation / **I** | Articles / Commentaires | Anti-IDOR : une ressource non possédée renvoie **404** (pas 403), pour ne pas confirmer son existence — voir les tests d'autorisation ([`conformance/hurl/errors_authorization.hurl`](../../apps/api/conformance/hurl/errors_authorization.hurl)). |
| T5 | Falsification d'entrées (payload malformé, types inattendus) | **T** | Interface API | Validation **Zod** systématique en frontière (schémas de `packages/shared`), rejet **422** avant tout accès base. |
| T6 | Injection SQL | **T** / **I** | Persistance | Requêtes **Prisma paramétrées** exclusivement ; `$queryRawUnsafe`/`$executeRawUnsafe` proscrits (verrou lint prévu, item B6). |
| T7 | Répudiation d'une action (« je n'ai pas écrit ça ») | **R**epudiation | Tous | Attribution `authorId` + horodatage (`createdAt`/`updatedAt`) sur chaque écriture. *Journal d'audit structuré : prévu avec les logs pino (item C6).* |
| T8 | Fuite de PII (email) via logs ou réponses | **I**nformation disclosure | Observabilité / API | Les réponses n'exposent jamais l'email d'un tiers (contrat RealWorld). *Masquage PII dans les logs : prévu avec le logger pino (item C6). Chiffrement email at-rest (AES-256-GCM + blind index) : prévu (item B5, noté dans `schema.prisma`).* |
| T9 | Fuite de secret dans le dépôt (clé, JWT secret) | **I** | Chaîne d'appro. | Garde pre-commit anti-`.env` + regex de secrets ([`lefthook.yml`](../../lefthook.yml)). *Scan TruffleHog en CI : prévu (item B3).* |
| T10 | Configuration incomplète en production (secret manquant) | **D** / **I** | Config | **Fail-fast** : l'API refuse de démarrer si l'environnement est invalide, en nommant les variables fautives ([`config/env.ts`](../../apps/api/src/config/env.ts)). |
| T11 | Requête cross-origin non autorisée | **S** / **T** | Interface API | **CORS** piloté par l'environnement validé (`CORS_ORIGIN`, appliqué dans `main.ts`) : le navigateur du front est le seul autorisé. |
| T12 | Saturation de l'API publique (scraping, DoS applicatif) | **D**enial of service | API publique | *Non mitigé aujourd'hui.* Prévu : en-têtes Helmet/CSP + rate limiting `@nestjs/throttler` (item B8). Menace **acceptée** en l'état pour une vitrine sans trafic réel. |
| T13 | Chaîne d'approvisionnement compromise (dépendance malveillante) | **T** / **E** | Dépendances | `pnpm audit --prod` en CI + `onlyBuiltDependencies` (blocage des scripts post-install) + Dependabot groupé ([ADR 003](../adr/003-mises-a-jour-dependances-dependabot.md)). *SBOM + OSV-Scanner + CodeQL : prévus (item B7).* |

## Lecture

Les mitigations marquées *prévu (item X)* renvoient à la roadmap d'outillage
production-grade : elles ne sont pas encore livrées et la menace correspondante est
**assumée** en l'état, ce qui est explicite ici plutôt que silencieux. C'est la valeur
d'un threat model tenu à jour : distinguer *couvert*, *prévu* et *accepté*.

## Références

- Framework : STRIDE (Microsoft), [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling).
- Mitigations livrées : [`apps/api/src/infrastructure/security/`](../../apps/api/src/infrastructure/security/), [`config/env.ts`](../../apps/api/src/config/env.ts), [`lefthook.yml`](../../lefthook.yml).
- Conformité d'autorisation : [`apps/api/conformance/hurl/errors_authorization.hurl`](../../apps/api/conformance/hurl/errors_authorization.hurl).
