# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique pour une faille de sécurité : une
divulgation publique avant correctif expose les utilisateurs.

Signaler en privé, au choix :

- **GitHub Security Advisories** — onglet « Security » → « Report a vulnerability »
  (divulgation coordonnée, canal privilégié).
- **E-mail** — `herve@kamanga.fr`, objet préfixé `[SECURITY]`.

Merci d'inclure : le composant touché, les étapes de reproduction, l'impact estimé,
et toute version/commit concernés.

## Engagement de traitement

| Étape | Délai visé |
| --- | --- |
| Accusé de réception | 72 heures |
| Évaluation initiale (sévérité, périmètre) | 7 jours |
| Correctif ou plan de mitigation | selon sévérité (voir la matrice du [runbook d'incident](docs/sre/incident-runbook.md)) |

La divulgation publique se fait **après** correctif, de manière coordonnée.

## Périmètre

Ce dépôt est une implémentation de démonstration de la spec RealWorld. Sont dans le
périmètre : l'authentification (hachage argon2id, jetons JWT), l'autorisation
(autorité côté serveur, anti-IDOR), la validation d'entrées (Zod), la configuration
(validation d'environnement au démarrage), et la chaîne d'approvisionnement
(dépendances). L'analyse de menaces structurée est documentée dans
[`docs/security/threat-model.md`](docs/security/threat-model.md).

Hors périmètre : les déploiements tiers d'un fork, et les faiblesses des dépendances
déjà suivies par `pnpm audit` / Dependabot (les signaler à l'amont concerné).
