# Registre des activités de traitement (Article 30)

> Registre des traitements de conduit-fullstack, tel qu'exigé par l'Article 30 du RGPD.
> La cartographie technique des champs vit dans [02-data-mapping.md](02-data-mapping.md) ;
> la source de vérité des données reste le [schema.prisma](../../../apps/api/prisma/schema.prisma).

## Responsable de traitement

- **Responsable** : le mainteneur du projet (Hervé Muludiki).
- **Coordonnées / point de contact** : voir [SECURITY.md](../../../SECURITY.md) (canal de
  signalement et de demandes d'exercice de droits).
- **DPO** : non désigné (traitement ne relevant pas de l'obligation de désignation, Art. 37).
  À réévaluer si le volume ou la nature des traitements évolue.

## Sous-traitants

| Sous-traitant | Rôle | Localisation | Garanties |
|---------------|------|--------------|-----------|
| Fournisseur PaaS d'hébergement | Exécution de l'API et du front | Région **UE** exigée | DPA à signer ; à défaut de région UE, clauses contractuelles types (CCT) |
| PostgreSQL managé | Persistance des données | Région **UE** exigée | Chiffrement at-rest plateforme, sauvegardes chiffrées, TLS en transit |
| Mailpit (dev uniquement) | Capture des emails en local | Poste développeur | Aucun email réel envoyé en production à ce stade |

> Aucun traitement ne fait appel à un service tiers d'analytics, d'emailing transactionnel de
> production, ou de paiement. En conséquence, **aucun transfert hors UE** n'est prévu tant que
> l'hébergement reste en région UE. Toute évolution (ajout d'un provider email, d'un CDN hors UE,
> d'un outil de mesure d'audience) déclenche une mise à jour de ce registre et une évaluation des
> transferts (Art. 44 à 49).

## Traitements

### T1 — Création et gestion des comptes, authentification

| Champ | Valeur |
|-------|--------|
| Finalité | Permettre l'inscription, la connexion et la gestion du compte utilisateur |
| Base légale | Art. 6(1)(b) exécution du contrat de service |
| Personnes concernées | Utilisateurs inscrits |
| Catégories de données | Email, `username`, `passwordHash` (argon2id), `bio`, `image`, horodatages |
| Destinataires | Interne (API), hébergeur (sous-traitant) |
| Transfert hors UE | Non |
| Durée de conservation | Durée de vie du compte ; anonymisation sur demande (Art. 17) ; purge des comptes inactifs en V2 (voir [06](06-retention-purge.md)) |
| Mesures de sécurité | Mot de passe haché argon2id (jamais en clair) ; email chiffré AES-256-GCM + blind index ([03](03-chiffrement-pii.md)) ; JWT `alg` épinglé, `sub` sans PII ; fail-fast config |

### T2 — Publication de contenu (articles, commentaires)

| Champ | Valeur |
|-------|--------|
| Finalité | Publier et afficher les articles et commentaires des utilisateurs |
| Base légale | Art. 6(1)(b) exécution du contrat |
| Personnes concernées | Auteurs (utilisateurs inscrits) |
| Catégories de données | `title`, `description`, `body` d'article ; `body` de commentaire ; `authorId` ; horodatages. Contenu à texte libre pouvant incidemment contenir des données personnelles |
| Destinataires | Public (contenu affiché en lecture libre), hébergeur |
| Transfert hors UE | Non |
| Durée de conservation | Tant que le contenu est publié ; à l'anonymisation du compte, le contenu est **conservé mais dissocié** de l'auteur ([05](05-droits-des-personnes.md)) |
| Mesures de sécurité | Attribution `authorId` + autorité serveur ; anti-IDOR 404 ; validation Zod en frontière |

### T3 — Interactions sociales (favoris, abonnements)

| Champ | Valeur |
|-------|--------|
| Finalité | Gérer les favoris d'articles et le suivi entre auteurs |
| Base légale | Art. 6(1)(b) exécution du contrat |
| Personnes concernées | Utilisateurs inscrits |
| Catégories de données | Graphe social : `Favorite(userId, articleId)`, `Follow(followerId, followingId)`, horodatages. Donnée comportementale et relationnelle |
| Destinataires | Interne ; agrégats publics dérivés (`favoritesCount`) ; hébergeur |
| Transfert hors UE | Non |
| Durée de conservation | Tant que le compte est actif ; supprimés en cascade à l'effacement du compte |
| Mesures de sécurité | Clés composites (pas de doublon), FK en cascade, autorité serveur |

### T4 — Journal d'audit et sécurité

| Champ | Valeur |
|-------|--------|
| Finalité | Prouver la responsabilité (Art. 5(2)) et détecter les abus (sécurité) |
| Base légale | Art. 6(1)(c) obligation légale (accountability) et Art. 6(1)(f) intérêt légitime (sécurité) |
| Personnes concernées | Utilisateurs inscrits, visiteurs (tentatives d'accès) |
| Catégories de données | Acteur **pseudonyme** (`userId` UUID, ou hash HMAC de l'email pour les acteurs sans compte), action, horodatage, métadonnées non-PII. Voir [04](04-logging-audit-pii-safe.md) |
| Destinataires | Interne (responsable de traitement) |
| Transfert hors UE | Non |
| Durée de conservation | 365 jours minimum (plancher anti-altération), 730 jours maximum ([06](06-retention-purge.md)) |
| Mesures de sécurité | Pseudonymisation de l'acteur ; pas d'email en clair ; rétention à plancher (un acteur ne peut pas raccourcir la rétention pour effacer ses traces) |

### T5 — Exercice des droits des personnes

| Champ | Valeur |
|-------|--------|
| Finalité | Traiter les demandes d'accès, de portabilité, de rectification et d'effacement |
| Base légale | Art. 6(1)(c) obligation légale (Art. 12 à 22) |
| Personnes concernées | Utilisateurs inscrits (self-service) ; demandeurs par le canal de contact |
| Catégories de données | Copie exportée des données de la personne ; trace d'audit de l'action (T4) |
| Destinataires | La personne concernée elle-même |
| Transfert hors UE | Non |
| Durée de conservation | La copie exportée n'est pas conservée côté serveur (générée à la demande) ; la trace d'audit suit T4 |
| Mesures de sécurité | Authentification requise (JWT) ; export limité aux données de l'appelant ; anonymisation irréversible de l'email |

### T6 — Journaux techniques et observabilité

| Champ | Valeur |
|-------|--------|
| Finalité | Exploitation, diagnostic d'incident, mesure de disponibilité |
| Base légale | Art. 6(1)(f) intérêt légitime (bon fonctionnement du service) |
| Personnes concernées | Utilisateurs, visiteurs |
| Catégories de données | Logs applicatifs (avec **masquage PII**, [04](04-logging-audit-pii-safe.md)), métriques SLO ([../../sre/slos.yaml](../../sre/slos.yaml)) |
| Destinataires | Interne, plateforme d'hébergement |
| Transfert hors UE | Non (selon la plateforme de logs retenue) |
| Durée de conservation | Rétention courte au niveau plateforme (à fixer, cible 30 jours) |
| Mesures de sécurité | Email et jeton masqués avant émission ; `sslmode` sur la BDD ; pas de query-log Prisma en production |

## Gate de revue

Conformément à la [méthode docs-as-code](README.md), toute modification du
[schema.prisma](../../../apps/api/prisma/schema.prisma) qui **ajoute, retire ou change un champ à
caractère personnel** doit, avant la PR :

1. Mettre à jour [02-data-mapping.md](02-data-mapping.md) (cartographie du champ).
2. Mettre à jour le traitement concerné de ce registre (durée, base légale, mesures).
3. Si un nouveau sous-traitant ou transfert apparaît : compléter la table des sous-traitants et
   évaluer les transferts (Art. 44 à 49).
4. Si une durée de conservation change : répercuter dans [06-retention-purge.md](06-retention-purge.md)
   et, en V2, dans la politique de confidentialité publique.
