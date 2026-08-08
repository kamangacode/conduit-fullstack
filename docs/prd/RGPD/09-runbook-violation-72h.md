# Runbook — Violation de données personnelles (72h)

> Procédure de réponse à une violation de données au sens de l'Article 4(12) du RGPD, avec les
> obligations de notification à l'autorité de contrôle (Art. 33, 72h) et aux personnes concernées
> (Art. 34). À tester une fois par an (exercice à blanc). Complète le
> [runbook d'incident SRE](../../sre/incident-runbook.md) sur le volet données personnelles.

## Définition

Une violation de données est « une violation de la sécurité entraînant, de manière accidentelle ou
illicite, la destruction, la perte, l'altération, la divulgation non autorisée de données à
caractère personnel, ou l'accès non autorisé à de telles données » (Art. 4(12)).

| Situation | Violation ? |
|-----------|-------------|
| Dump de la base exfiltré (emails chiffrés + contenus) | **Oui** |
| Fuite d'un `DATABASE_URL` ou d'une clé de chiffrement | **Oui** (accès potentiel) |
| Tentative d'accès bloquée par l'anti-IDOR (404) | Non (pas d'accès effectif) |
| Perte définitive de la clé de chiffrement (données illisibles) | **Oui** (perte / destruction) |
| Bug exposant l'email d'un tiers dans une réponse API | **Oui** (divulgation) |

## Timeline

| Jalon | Action |
|-------|--------|
| T+0 | Détection, isolation, préservation des preuves |
| T+1h | Ouverture de la cellule de crise (voir rôles) |
| T+24h | Qualification écrite (nature, données, personnes, risque) |
| **T+72h max** | Notification à l'autorité de contrôle (CNIL) **si risque** pour les droits et libertés |
| Sans délai | Notification aux personnes concernées **si risque élevé** (Art. 34) |
| T+15j | Post-mortem sans blâme + actions correctives |

## Rôles

Projet à mainteneur unique : les rôles ci-dessous peuvent être portés par la même personne, mais
chaque responsabilité doit être explicitement traitée.

- **Responsable de traitement** : décide de la qualification et des notifications.
- **Référent technique** : isole, préserve les preuves, applique les correctifs (rotation de secrets,
  révocation).
- **Communication** : rédige les notifications (CNIL, personnes).
- **Conseil juridique** (externe, au besoin) : arbitre les cas limites de notification.

## Étape 1 — Isolation et préservation

- Geler la propagation : rotation immédiate du secret compromis (`DATABASE_URL`,
  `FIELD_ENCRYPTION_KEY`, `EMAIL_BLIND_INDEX_KEY`, `JWT_SECRET`, `GDPR_HMAC_SECRET`), blocage
  d'IP/comptes si pertinent.
- **Préserver les preuves** : ne pas purger les logs ni le journal d'audit ([04](04-logging-audit-pii-safe.md)) ;
  exporter l'`AuditLog` pertinent.
- Tracer l'incident dans un canal privé (issue privée, label `incident-rgpd`).

## Étape 2 — Qualification

Rédiger : nature de la violation, catégories et volume de données, nombre de personnes concernées,
conséquences probables. Critère Art. 33(1) : « risque pour les droits et libertés ». **En cas de
doute, notifier.**

### Le chiffrement change la qualification (Art. 34(3)(a))

La notification **aux personnes** n'est **pas requise** si les données concernées étaient
protégées par des mesures rendant les données incompréhensibles à toute personne non autorisée,
**notamment le chiffrement**, et que la clé n'a pas été compromise.

- L'email est chiffré at-rest (AES-256-GCM, [03](03-chiffrement-pii.md)) : un dump où **seule** la
  base fuit, **sans** la clé, peut dispenser de la notification aux personnes pour cette donnée.
- **Attention** : `bio`, `image`, et tout le contenu public (articles, commentaires) ne sont **pas**
  chiffrés (et sont d'ailleurs publics). Le graphe social (favoris, follows) n'est pas chiffré. La
  dispense ne couvre donc que l'email, et seulement si la clé n'a pas fuité.
- Une fuite **conjointe** de la base et de `FIELD_ENCRYPTION_KEY` retire le bénéfice de la dispense.

## Étape 3 — Notification à l'autorité de contrôle (CNIL)

- Via le téléservice CNIL (compte créé en amont pour ne pas perdre de temps le jour J).
- Contenu (Art. 33(3)) : nature, catégories et nombre approximatif de personnes et
  d'enregistrements, coordonnées du contact, conséquences probables, mesures prises/proposées.
- Notification **en deux temps** possible si toutes les informations ne sont pas disponibles sous 72h.

## Étape 4 — Notification aux personnes (Art. 34)

- Requise si **risque élevé** et hors dispense (§Étape 2).
- Langage clair et simple ; par email (via le canal de contact) ou notification in-app.
- Contenu : nature, contact, conséquences probables, mesures prises et recommandations (ex. changer
  son mot de passe).

## Étape 5 — Registre des violations (Art. 33(5))

Consigner **toutes** les violations (même celles non notifiées) dans
`docs/compliance/registre-violations.md` (à créer au premier incident) : faits, effets, mesures.
Le registre est tenu à disposition de l'autorité de contrôle.

## Étape 6 — Post-mortem

- Sous 15 jours, post-mortem sans blâme (réutiliser [../../sre/postmortem-template.md](../../sre/postmortem-template.md)).
- Actions correctives tracées ; mise à jour du threat-model et, au besoin, d'un ADR.

## Exercice annuel

Rejouer ce runbook à blanc une fois par an (scénario simulé : fuite de `DATABASE_URL`), pour
vérifier que les accès (téléservice CNIL, coffre de secrets) et les rôles sont opérationnels.

## Critères d'acceptation

- AC-1 : la procédure nomme un déclencheur, des rôles et une timeline chiffrée jusqu'à T+72h.
- AC-2 : elle intègre la dispense Art. 34(3) liée au chiffrement de l'email et ses limites.
- AC-3 : elle impose la préservation du journal d'audit avant toute purge.
- AC-4 : elle prévoit un registre des violations et un exercice annuel.
