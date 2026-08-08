# Politique de rétention et purge automatique

> Applique le principe de limitation de la conservation (Art. 5(1)(e)) : ne pas conserver les
> données au-delà de ce qui est nécessaire. Conduit ayant un modèle simple (pas de sessions
> serveur, pas de facturation, pas de logs de délivrabilité), la politique est légère mais explicite.

## 1. Ce qui n'a PAS de rétention à gérer côté application

Pour éviter de copier des mécanismes de crmcoaching qui ne s'appliquent pas ici :

- **Sessions** : le JWT est **stateless** (ADR 007), stocké en `localStorage`. Aucune session
  serveur à purger. Le jeton expire seul (`JWT_EXPIRES_IN`, défaut `7d`).
- **Logs de délivrabilité email** : aucun envoi d'email réel en production (Mailpit est un outil de
  dev). Rien à conserver.
- **Données de facturation** : inexistantes, donc aucune obligation de conservation longue
  (comptable) qui bloquerait un effacement.

## 2. Catégories soumises à rétention

| Catégorie | Rétention cible | Env var | Contrainte | Justification |
|-----------|-----------------|---------|------------|---------------|
| `AuditLog` | 365 jours | `RETENTION_AUDIT_LOG_DAYS` | **plancher 365**, plafond 730 | Responsabilité (Art. 5(2)) ; le plancher empêche de raccourcir la rétention pour effacer des traces |
| Comptes inactifs (V2) | 24 mois d'inactivité | `RETENTION_INACTIVE_ACCOUNT_MONTHS` | 12 à 60 | Limitation de conservation ; anonymisation, pas suppression (contenu public) |
| Journaux techniques | 30 jours | (plateforme) | au niveau plateforme de logs | Diagnostic d'incident sans conservation prolongée |

- Les durées sont **validées au boot** (schéma Zod, comme `config/env.ts`) : une valeur hors bornes
  interrompt le démarrage.
- Le **plancher** sur `AuditLog` est un invariant de sécurité, pas un simple défaut.

## 3. Traitement de purge

### Déclenchement

- Un traitement planifié quotidien (ex. `0 3 * * *`, fuseau `Europe/Paris`). Selon la plateforme :
  planificateur managé (cron de la PaaS) ou déclencheur applicatif. Conduit n'a pas aujourd'hui de
  moteur de jobs : l'implémentation la plus simple est un **script idempotent**
  (`apps/api/prisma/scripts/run-retention.ts`) invoqué par le planificateur de la plateforme.
- Un endpoint interne de déclenchement manuel est **optionnel** (utile pour tester) et, s'il existe,
  doit être protégé (non exposé publiquement) et limité en fréquence.

### Comportement

- **Mode `--dry-run`** : compte les lignes éligibles sans supprimer. À exécuter avant le premier
  `--apply` en production.
- **Isolation par catégorie** : une erreur sur une catégorie ne bloque pas les autres (chaque
  catégorie renvoie son compteur, les erreurs sont collectées).
- **Idempotent** : rejouer la purge est sûr (elle ne cible que ce qui dépasse le seuil).
- **Auditée** : chaque passage écrit une entrée `retention.run` ([04](04-logging-audit-pii-safe.md))
  avec les compteurs par catégorie (best-effort, non bloquant).

### Anonymisation vs suppression dans la purge

- `AuditLog` au-delà du plafond : **supprimé** (donnée pseudonyme, plus nécessaire).
- Compte inactif (V2) : **anonymisé** via la même mécanique que le droit à l'effacement
  ([05](05-droits-des-personnes.md)), jamais supprimé en dur (préserve le contenu public).

## 4. Variables d'environnement ajoutées

À ajouter à `apps/api/.env.example` et au schéma Zod `apps/api/src/config/env.ts` :

```
# Rétention (jours / mois) — validées au boot
RETENTION_AUDIT_LOG_DAYS=365          # min 365, max 730
RETENTION_INACTIVE_ACCOUNT_MONTHS=24  # V2, min 12, max 60
```

## 5. Critères d'acceptation

- AC-1 : `run-retention --dry-run` rapporte les compteurs sans rien supprimer.
- AC-2 : `RETENTION_AUDIT_LOG_DAYS` < 365 interrompt le boot (plancher).
- AC-3 : une purge supprime uniquement les `AuditLog` plus vieux que le seuil et écrit une entrée
  `retention.run`.
- AC-4 : une erreur sur une catégorie n'empêche pas les autres d'être purgées.
- AC-5 (V2) : un compte inactif au-delà du seuil est **anonymisé**, pas supprimé.
