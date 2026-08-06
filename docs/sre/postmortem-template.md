# Post-mortem — <titre court de l'incident> — <AAAA-MM-JJ>

> Analyse **sans reproche** (blameless) : on améliore le système, on ne juge pas les
> personnes. À rédiger dans les 72 h suivant la résolution d'un P0/P1, tant que les
> souvenirs sont frais. Copier ce gabarit dans `docs/sre/postmortems/AAAA-MM-JJ-slug.md`.

**Durée** : <hh:mm → hh:mm> (<N> minutes)
**Sévérité** : <P0 | P1> — <part des utilisateurs impactés>
**Rédacteur** : <nom>

## Impact

- Qui / combien d'utilisateurs, quelles fonctionnalités, pendant combien de temps.
- Effets secondaires (données en attente, e-mails non partis, etc.).

## Timeline

| Heure | Événement |
|-------|-----------|
| hh:mm | Détection (comment ?) |
| hh:mm | Déclaration de l'incident |
| hh:mm | Cause identifiée |
| hh:mm | Mitigation appliquée |
| hh:mm | Retour à l'état stable, clôture |

## Causes racines (5 pourquoi)

1. Pourquoi … ? → …
2. Pourquoi … ? → …
3. Pourquoi … ? → …
4. Pourquoi … ? → …
5. Pourquoi … ? → *cause systémique* (le vrai point à corriger).

## Action items

| # | Action (corrige la cause systémique, pas le symptôme) | Propriétaire | Échéance |
|---|--------------------------------------------------------|--------------|----------|
| 1 | … | … | AAAA-MM-JJ |

## Ce qui a bien fonctionné

- … (à conserver : détection rapide, rollback propre, logs suffisants…).

## Ce qu'on a appris

- … (transférable à d'autres parties du système).
