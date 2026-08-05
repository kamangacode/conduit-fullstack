# ADR 007 — Authentification : argon2id et jose derrière des ports du domaine

## Status

Accepted — 2026-08-05.

## Context

La slice F2 (issue 3) introduit l'authentification : inscription, connexion,
utilisateur courant, mise à jour du compte. Jusqu'ici le dépôt n'embarquait
**aucune** primitive cryptographique — ni hachage de mot de passe, ni signature
de jeton.

Trois contraintes cadrent la décision :

- **R-9** (PRD §11) : le mot de passe n'est jamais renvoyé et est stocké haché.
  C'est la seule règle métier du PRD qui porte sur un choix cryptographique.
- **PRD §9** : le jeton est un JWT transmis en `Authorization: Token <jwt>` —
  préfixe `Token`, **pas** `Bearer`. C'est un écart délibéré de la spec
  RealWorld par rapport à l'usage courant, et la suite de conformité Hurl (F7)
  le vérifie.
- **Rule 12** : `domain/` est du TypeScript pur, sans import technique. Une
  primitive cryptographique est par nature un détail d'infrastructure.

S'ajoute une contrainte d'environnement constatée pendant l'instruction de cette
décision, et non anticipée : le dépôt tourne sous **Node 25**, dont l'ABI (141)
est trop récente pour la plupart des paquets natifs compilés par `node-gyp`.

## Options Considered

### Hachage du mot de passe

| Option | Trade-off |
|---|---|
| **argon2id via `@node-rs/argon2` (retenue)** | Lauréat de la Password Hashing Competition, recommandation OWASP n°1. Implémentation Rust distribuée en binaires N-API : l'ABI N-API est stable d'une version de Node à l'autre, donc pas de recompilation à chaque montée de version. Coût : dépendance à des binaires précompilés par plateforme, et paquet moins connu que son homologue historique. |
| argon2id via `argon2` (npm) | Le paquet le plus répandu, mais compilé par `node-gyp`. **Écarté sur preuve** : installé puis exécuté, il échoue au chargement — `No native build was found for platform=darwin arch=x64 runtime=node abi=141`. Aucun prebuild ne couvre Node 25 ; le faire compiler depuis les sources imposerait une chaîne de build C sur chaque poste et dans chaque image Docker. |
| bcrypt | Éprouvé et au paramétrage trivial (un seul facteur de coût), mais tronque **silencieusement** au-delà de 72 octets — un piège qu'il faudrait neutraliser et tester. Même problème de compilation native que ci-dessus. |
| scrypt (`node:crypto`) | Zéro dépendance, aucun risque de supply chain ni de build. Écarté parce qu'il faudrait écrire soi-même l'encodage sel + paramètres et la comparaison à temps constant — du code cryptographique maison est exactement ce qu'on ne veut pas avoir à relire. |

### Signature du jeton

| Option | Trade-off |
|---|---|
| **`jose` (retenue)** | Zéro dépendance transitive, API alignée sur les RFC (JWS/JWT), typée, maintenue. Fonctionne en JS pur : aucun binaire natif. Coût : câblage manuel du module NestJS, aucun sucre syntaxique. |
| `@nestjs/jwt` | Idiomatique NestJS (`JwtModule.registerAsync`). Écarté pour deux raisons : il embarque `jsonwebtoken` et ses transitives, et il pousse à injecter un service NestJS jusque dans la couche `application/`, en tension directe avec la règle de dépendance. |
| `jsonwebtoken` direct | Le plus répandu et le mieux documenté. Écarté : API historique à callbacks, typage externalisé dans `@types`, et un historique de CVE portant sur les options de vérification (algorithmes acceptés notamment). |

### Vérification du jeton côté NestJS

| Option | Trade-off |
|---|---|
| **Guard maison (retenue)** | ~40 lignes, lit `Authorization`, exige le préfixe `Token`, délègue la vérification au port. Coût : code à écrire et à tester nous-mêmes. |
| Passport + `passport-jwt` | Standard de fait dans l'écosystème NestJS. Écarté : `passport-jwt` extrait par défaut un préfixe `Bearer`, donc le contrat RealWorld imposerait déjà un extracteur maison — on paierait trois dépendances pour continuer à écrire le seul morceau qui compte. |

## Decision

Le mot de passe est haché avec **argon2id** via `@node-rs/argon2`, paramétré
selon la recommandation OWASP : `memoryCost = 19456` (19 MiB), `timeCost = 2`,
`parallelism = 1`. Ces paramètres sont encodés dans la chaîne PHC produite
(`$argon2id$v=19$m=19456,t=2,p=1$…`), donc un durcissement ultérieur n'invalide
pas les hachages existants — chaque hachage porte les paramètres avec lesquels
il a été calculé.

Le jeton est un **JWT HS256** signé avec `jose`, dont le `sub` porte l'identifiant
de l'utilisateur et rien d'autre. Aucune donnée personnelle (email, username)
n'est placée dans le jeton : un JWT n'est pas chiffré, seulement signé, et son
contenu est lisible par quiconque l'intercepte.

Les deux primitives sont accédées **exclusivement** par des ports déclarés dans
`domain/user/ports/` (`PasswordHasher`, `TokenService`), implémentés dans
`infrastructure/security/`. Ni `domain/` ni `application/` n'importe
`@node-rs/argon2` ou `jose` : les use-cases dépendent de l'interface.

La vérification du jeton est portée par un guard NestJS maison
(`interface/auth/`), qui impose le préfixe `Token` et délègue au port.

## Consequences

### Positive

- La règle de dépendance est tenue sans effort de discipline : le use-case
  d'inscription ne peut pas importer une lib de hachage, il n'en connaît aucune.
- Changer d'algorithme ou de bibliothèque devient un changement d'adapter, avec
  les tests de use-case inchangés pour le prouver.
- Aucune compilation native : `pnpm install` se comporte pareil sur un poste, en
  CI et dans une image Docker — le mode de panne le plus coûteux à diagnostiquer
  (« ça marche chez moi ») est retiré.
- Les paramètres argon2 étant portés par le hachage lui-même, la migration vers
  des paramètres plus durs est incrémentale plutôt que big-bang.

### Negative

- `@node-rs/argon2` est nettement moins téléchargé que `argon2` : en cas
  d'abandon, la migration serait à refaire. Le port limite le coût de cette
  migration au seul adapter, mais ne la supprime pas.
- Les binaires N-API sont distribués en paquets optionnels par plateforme. Une
  plateforme non couverte (architecture exotique, musl inhabituel) casserait
  l'installation — le risque est déplacé, pas supprimé.
- Le guard maison est du code de sécurité que nous maintenons. Il doit être testé
  sur ses chemins de refus (en-tête absent, préfixe `Bearer`, jeton expiré,
  signature invalide), pas seulement sur son chemin nominal.

### Neutral

- HS256 (secret symétrique) plutôt que RS256 : il n'y a qu'un seul émetteur et un
  seul vérificateur, tous deux dans `apps/api`. RS256 n'aurait de sens que si un
  tiers devait vérifier les jetons sans pouvoir en émettre.
- La révocation de jeton n'est pas traitée : le contrat RealWorld ne la prévoit
  pas, et le seul moyen de révoquer un JWT sans état serait une liste de
  révocation, hors périmètre.
- Le chiffrement PII at-rest de l'email (item B5, Phase 5) reste à venir et
  n'interfère pas avec cette décision : il porte sur la colonne `email`, pas sur
  `passwordHash`.
