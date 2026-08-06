# Runbook d'incident

> Procédure pour détecter, coordonner, résoudre et communiquer un incident en
> production. Objectif : réduire le temps de résolution (MTTR), pas trouver un coupable.

## Matrice de sévérité

| Niveau | Définition | SLA réponse | SLA résolution | Post-mortem |
|--------|------------|-------------|----------------|-------------|
| **P0** | Service totalement indisponible | 15 min | 4 h | obligatoire |
| **P1** | Fonctionnalité critique dégradée (auth, publication) | 30 min | 8 h | obligatoire |
| **P2** | Fonctionnalité secondaire dégradée, contournement existant | 4 h | 3 j | recommandé |
| **P3** | Inconfort mineur | 2 j | best-effort | non |

> Les délais sont calibrés pour un projet mono-mainteneur (pas d'astreinte 24/7). Ils
> se resserreraient avec une équipe et une rotation d'astreinte.

## Rôles

- **Incident Commander (IC)** : coordonne, décide, communique — **ne code pas**. Sur un
  projet mono-mainteneur, l'IC et l'intervenant sont la même personne : l'IC devient
  alors une *checklist* qu'on se force à suivre, pas un second humain.

## Procédure P0 / P1

1. **Détecter** — alerte (sonde de santé `GET /health`, monitoring) ou signalement.
2. **Déclarer** — ouvrir un canal de suivi horodaté ; noter l'heure de début.
3. **Communiquer** — statut initial (impact, périmètre) ; mettre à jour toutes les 30 min.
4. **Stabiliser d'abord** — préférer un **rollback** rapide à un correctif incertain.
   Restaurer le service prime sur comprendre la cause.
5. **Résoudre** — appliquer le correctif, vérifier le retour à l'état stable (SLI).
6. **Clôturer** — noter l'heure de fin, communiquer la résolution.
7. **Apprendre** — planifier le [post-mortem](postmortem-template.md) sous 72 h (P0/P1).

## État stable (steady state)

Le service est considéré nominal quand : `GET /health` répond 200, le taux de 5xx est
sous le SLO d'availability, et la latence p99 est sous 500 ms (voir [`slos.yaml`](slos.yaml)).

## Runbooks ciblés (à enrichir au fil des incidents)

- **Base saturée (connexions)** : vérifier le pool, rollback de la dernière migration/déploiement suspect.
- **Déploiement en échec** : promouvoir le dernier artefact vert connu ; ne pas patcher à chaud.
- **Pic de trafic** : à traiter avec le rate limiting une fois livré (item B8).
