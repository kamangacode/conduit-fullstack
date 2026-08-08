# PRD Conformité RGPD — Document principal

> Spécifie la mise en conformité RGPD de conduit-fullstack : objectifs, rôles,
> exigences fonctionnelles et non fonctionnelles, périmètre, phasage. Les annexes
> techniques détaillent chaque mesure (voir [README.md](README.md)).

## 1. Contexte

conduit-fullstack est une implémentation de l'app RealWorld (« Conduit », clone de Medium)
tenue comme un vrai projet de production. Elle expose une API REST NestJS (`apps/api`,
architecture hexagonale) et un front Next.js (`apps/web`), autour de trois agrégats :
comptes/profils, articles (avec favoris et tags) et commentaires.

Le projet manipule des données à caractère personnel : l'email de l'utilisateur (identifiant
de connexion), son pseudonyme (`username`), sa biographie et son avatar, ainsi que tout le
contenu qu'il génère (articles, commentaires) et son graphe social (qui suit qui, qui aime
quoi). Aujourd'hui, aucun dispositif de conformité RGPD n'est outillé : l'email est en clair
en base, il n'existe ni journal d'audit, ni politique de rétention, ni moyen pour une personne
d'exercer ses droits (accès, portabilité, effacement).

Le [modèle de menaces](../../security/threat-model.md) documente déjà ce gap comme roadmap
assumée : chiffrement email at-rest (item B5), masquage PII des logs et journal d'audit (item
C6), en-têtes de sécurité et rate limiting (item B8), outillage supply-chain (item B7). Ce PRD
transforme ces items en exigences spécifiées.

## 2. Problème

Sans ces mesures, le projet ne peut pas démontrer les principes fondamentaux du RGPD :

- **Sécurité du traitement (Art. 32)** : une fuite de la base exposerait des emails en clair.
- **Minimisation (Art. 5(1)(c))** : le jour où des logs applicatifs arriveront, rien n'empêche
  qu'ils contiennent des emails ou des jetons.
- **Limitation de conservation (Art. 5(1)(e))** : les données sont conservées indéfiniment.
- **Droits des personnes (Art. 15/16/17/20)** : une personne ne peut ni récupérer ni faire
  effacer ses données.
- **Responsabilité (Art. 5(2))** : aucune trace prouvant qui a fait quoi sur les données.
- **Registre (Art. 30)** : aucune cartographie des traitements.

## 3. Objectifs

| # | Objectif | Mesuré par |
|---|----------|------------|
| O1 | Chiffrer l'email at-rest sans casser l'unicité ni le login | Aucune colonne email en clair en base ; login et register inchangés fonctionnellement ([03](03-chiffrement-pii.md)) |
| O2 | Garantir que les logs ne divulguent jamais de PII | Tout logger passe par le wrapper de masquage ; email/jeton masqués dans messages et stacks ([04](04-logging-audit-pii-safe.md)) |
| O3 | Tracer les actions sensibles sur les données | Journal d'audit des exports/effacements/connexions, conservé et non altérable ([04](04-logging-audit-pii-safe.md)) |
| O4 | Permettre l'exercice self-service des droits | Endpoints export (Art. 15/20) et effacement/anonymisation (Art. 17) sur le compte authentifié ([05](05-droits-des-personnes.md)) |
| O5 | Appliquer une politique de rétention | Purge automatique documentée et exécutée ([06](06-retention-purge.md)) |
| O6 | Sécuriser la connexion et les secrets de bout en bout | TLS imposé, secrets validés au boot ([07](07-connexion-bdd-et-secrets.md)) |
| O7 | Durcir la surface applicative et la chaîne d'appro. | Rate limiting, en-têtes HTTP, SAST/SBOM/OSV ([08](08-securite-transverse.md)) |
| O8 | Documenter la conformité | Registre Art. 30, data-mapping, runbook violation ([01](01-registre-traitements-art30.md), [02](02-data-mapping.md), [09](09-runbook-violation-72h.md)) |

## 4. Non-objectifs (hors périmètre)

- **Modifier le contrat RealWorld.** Les endpoints officiels (register, login, get/update user,
  articles, comments, profiles) ne changent pas de comportement. Les droits des personnes sont
  ajoutés en **extension tracée**, hors du périmètre vérifié par la suite de conformité
  Hurl/Playwright (comme l'a été le SSE : voir `docs/scope/hors-perimetre.md`).
- **Chiffrer `username`.** C'est un identifiant public présent dans les URLs (`/profiles/:username`) :
  il ne peut pas être chiffré sans casser l'application. Il est pseudonymisé à l'effacement.
- **Chiffrer `bio`/`image` en V1.** Ces champs sont affichés publiquement sur le profil : un
  chiffrement at-rest y apporte peu. Reporté en V2 ([03](03-chiffrement-pii.md) §V2).
- **Révocation de jeton / sessions serveur.** Le JWT est stateless par conception (ADR 007,
  localStorage côté front). Le durcissement (expiration courte + rotation) est noté mais reste
  hors du périmètre de ce PRD ; le lien avec la sécurité des données est traité en [08](08-securite-transverse.md).
- **Bannière cookies / consentement.** L'app n'utilise ni cookie ni session serveur (le jeton
  vit en `localStorage`, ADR 012) : pas de traceur soumis à consentement à ce stade.

## 5. Rôles et acteurs

| Rôle | Qui | Responsabilité RGPD |
|------|-----|---------------------|
| Responsable de traitement | Le mainteneur du projet (Hervé Muludiki) | Détermine finalités et moyens, tient le registre, notifie les violations |
| Sous-traitant (hébergement) | Fournisseur PaaS + PostgreSQL managé (région UE) | Sécurité de l'infrastructure, chiffrement at-rest plateforme |
| Personne concernée | Utilisateur inscrit | Exerce ses droits en self-service (compte authentifié) |
| Contact / point d'entrée | Voir [SECURITY.md](../../../SECURITY.md) | Reçoit les demandes d'exercice de droits et les signalements |

> Conduit n'a pas de rôle « admin » ni de RBAC (contrairement à crmcoaching). L'exercice des
> droits est donc **self-service** : la personne concernée est l'utilisateur authentifié
> lui-même, son identité étant prouvée par le JWT (`sub = userId`). Un chemin assisté par le
> responsable de traitement (demande par email hors application) est décrit en
> [05](05-droits-des-personnes.md) §Chemin assisté, sans nécessiter d'interface admin.

## 6. Base légale par traitement (synthèse)

Détail complet dans le [registre Art. 30](01-registre-traitements-art30.md).

| Traitement | Base légale (Art. 6) |
|------------|----------------------|
| Création et gestion du compte, authentification | 6(1)(b) exécution du contrat de service |
| Publication d'articles et de commentaires | 6(1)(b) exécution du contrat |
| Graphe social (favoris, follows) | 6(1)(b) exécution du contrat |
| Journal d'audit et sécurité | 6(1)(c) / 6(1)(f) obligation légale (Art. 5(2)) et intérêt légitime (sécurité) |
| Exercice des droits (export, effacement) | 6(1)(c) obligation légale (Art. 12 à 22) |

## 7. Exigences

### 7.1 Fonctionnelles

- **EF-1 Chiffrement email at-rest.** L'email est stocké chiffré (AES-256-GCM) ; un blind index
  HMAC préserve l'unicité et le lookup exact au login. Register et login restent fonctionnellement
  identiques. Détail : [03](03-chiffrement-pii.md).
- **EF-2 Droit d'accès et portabilité (Art. 15/20).** Un utilisateur authentifié peut exporter
  l'ensemble de ses données dans un format lisible et réutilisable (JSON). Détail : [05](05-droits-des-personnes.md).
- **EF-3 Droit à l'effacement (Art. 17) par anonymisation.** Un utilisateur authentifié peut faire
  anonymiser son compte : email, bio, image dissociés, `username` remplacé par un pseudonyme, les
  contenus publics étant conservés dissociés de l'identité. Détail : [05](05-droits-des-personnes.md).
- **EF-4 Droit de rectification (Art. 16).** Déjà couvert par `PUT /api/user` (email, username,
  bio, image, password) ; le PRD le documente comme mesure de rectification et l'étend au besoin.
- **EF-5 Journal d'audit.** Les actions sensibles (export, effacement, connexion échouée) sont
  journalisées avec un acteur pseudonyme et un horodatage. Détail : [04](04-logging-audit-pii-safe.md).
- **EF-6 Purge automatique.** Un traitement planifié applique la politique de rétention. Détail :
  [06](06-retention-purge.md).

### 7.2 Non fonctionnelles

- **ENF-1 Masquage PII des logs.** Aucun logger ne peut émettre un email ou un jeton en clair en
  production. [04](04-logging-audit-pii-safe.md).
- **ENF-2 Fail-fast des secrets de conformité.** L'API refuse de démarrer en production si une clé
  de chiffrement ou un secret HMAC manque ou est malformé, sans réafficher la valeur. [03](03-chiffrement-pii.md), [07](07-connexion-bdd-et-secrets.md).
- **ENF-3 TLS en transit.** La connexion à PostgreSQL impose TLS (`sslmode=require` minimum,
  `verify-full` cible). [07](07-connexion-bdd-et-secrets.md).
- **ENF-4 Rate limiting et en-têtes de sécurité.** Anti-brute-force sur le login, Helmet/CSP/HSTS.
  [08](08-securite-transverse.md).
- **ENF-5 Anti-IDOR et autorité serveur.** Maintenus (404 pas 403, attribution dérivée du JWT).
  [08](08-securite-transverse.md).
- **ENF-6 Supply-chain.** SAST, SBOM, scan de vulnérabilités, license check en CI. [08](08-securite-transverse.md).
- **ENF-7 Réversibilité de clé documentée.** Perte de clé = données illisibles : sauvegarde et
  procédure de rotation documentées. [03](03-chiffrement-pii.md), [07](07-connexion-bdd-et-secrets.md).

## 8. Contraintes propres à Conduit

| Contrainte | Impact sur le design |
|------------|----------------------|
| Le contrat RealWorld renvoie `email` et `token` en clair dans la réponse d'auth | Le chiffrement est **at-rest uniquement** ; le JWT ne porte que `sub` (pas de PII), ce qui limite l'exposition d'un jeton intercepté |
| `email @unique` + lookup au login | Le chiffrement GCM est non déterministe : un **blind index** HMAC est indispensable pour l'unicité et `findByEmail` |
| `username` public dans les URLs | Non chiffrable ; pseudonymisé à l'effacement |
| `onDelete: Cascade` sur toutes les FK | L'effacement dur détruirait le contenu public : **anonymisation** retenue |
| JWT stateless, `localStorage` | Pas de session serveur à purger ; risque XSS = vol de jeton (durcissement hors périmètre) |
| Pas de rôle admin / RBAC | Droits **self-service** ; pas d'interface admin à créer |
| Pas d'envoi d'email réel en prod (Mailpit dev only) | Pas de logs de délivrabilité à conserver ni de sous-traitant email |
| Pas de facturation | Pas de conservation légale longue (ex. 10 ans comptables) qui bloquerait un effacement |

## 9. Dépendances et pré-requis

- Ajout de colonnes au `schema.prisma` (`emailBlindIndex`, table `AuditLog`) avec migrations
  versionnées, sans downtime ([03](03-chiffrement-pii.md) §Migration).
- Nouvelles variables d'environnement validées au boot (voir chaque annexe) ajoutées à
  `apps/api/.env.example` et au schéma Zod `apps/api/src/config/env.ts`.
- Un logger structuré (item C6 du threat-model) : ce PRD en fait un pré-requis de EF-5/ENF-1.

## 10. Risques

| Risque | Gravité | Mitigation |
|--------|---------|------------|
| Perte de la clé de chiffrement | Élevée (données illisibles) | Sauvegarde hors dépôt + procédure de rotation documentée (ENF-7) |
| Migration de chiffrement sur données existantes | Moyenne | Backfill idempotent par batch + mode strict différé + soak window ([03](03-chiffrement-pii.md)) |
| Blind index déterministe : corrélation email connu | Faible | Clé HMAC secrète distincte ; pas de recherche partielle exposée |
| Anonymisation incomplète (champ PII oublié) | Moyenne | Liste exhaustive des champs dans [05](05-droits-des-personnes.md), test de non-régression |
| Régression du contrat RealWorld | Moyenne | Endpoints RGPD hors périmètre Hurl ; suite de conformité inchangée |

## 11. Périmètre par version

- **V1 (conformité de base)** : chiffrement email + blind index (EF-1), logger PII-safe + audit
  (EF-5, ENF-1), export + anonymisation self-service (EF-2, EF-3), rétention audit + purge (EF-6),
  TLS BDD + fail-fast secrets (ENF-2, ENF-3), rate limiting + Helmet (ENF-4), registre Art. 30 +
  data-mapping + runbook violation.
- **V2 (durcissement)** : chiffrement `bio`/`image`, SBOM/SAST/OSV complets, purge des comptes
  inactifs, politique de confidentialité publique, DPIA si le traitement évolue.

## 12. Critères d'acceptation globaux

- Aucune valeur email en clair dans la table `users` après migration (vérifié par requête SQL).
- `grep` d'un logger natif non masquant échoue la revue ; un email loggué apparaît masqué.
- Un export renvoie toutes les données de la personne ; une anonymisation rend l'email
  irrécupérable et conserve les articles dissociés.
- L'API refuse de démarrer en production sans les clés de conformité.
- Le registre Art. 30 et le data-mapping couvrent 100 % des modèles du `schema.prisma`.

## 13. Phasage

Voir la roadmap détaillée et le mapping vers les exigences REQ-PRIV dans
[10-exigences-et-roadmap.md](10-exigences-et-roadmap.md).
