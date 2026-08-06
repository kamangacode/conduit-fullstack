# Hors périmètre — et pourquoi

> Une vitrine de craft se juge autant à ce qu'elle **choisit de ne pas faire** qu'à ce
> qu'elle livre. Ce dépôt implémente la spec **RealWorld** (un clone de Medium) ; il
> couvre volontairement une large part du référentiel craft, mais plusieurs pratiques du
> référentiel n'ont **pas** de justification dans ce contexte. Les exclure sciemment,
> plutôt que par oubli, fait partie du craft (« le craft, c'est le jugement »).

## Exclusions assumées

| Pratique (référentiel) | Pourquoi hors périmètre ici |
|------------------------|------------------------------|
| **Micro-services** | Un seul service suffit au domaine. Le monolithe modulaire (hexagonal) est le bon défaut ; on ne paie pas le coût d'exploitation d'un système distribué pour un CRUD social. |
| **Messaging (Kafka / Outbox / CDC)** | Aucune intégration asynchrone inter-services à fiabiliser. L'Outbox résout un problème (atomicité DB ↔ bus) que ce système n'a pas. |
| **CQRS / Event Sourcing** | Le domaine est essentiellement CRUD ; l'historique d'événements n'a pas de valeur métier. Une légère séparation lecture/écriture existe déjà via des ports de query dédiés ([ADR 011](../adr/011-lecture-des-listes-port-dedie.md)), ce qui suffit. |
| **Chaos Engineering en production** | Sans astreinte ni trafic réel, injecter des pannes en prod n'apporte rien. Les tests d'intégration sur base jetable couvrent déjà les scénarios de panne pertinents. |
| **GitOps (ArgoCD) / IaC (Terraform)** | Cibles de déploiement PaaS (Railway / Vercel) : l'infrastructure est déclarée par la plateforme, pas par des manifestes Kubernetes. |
| **Service mesh** | Corollaire de l'absence de micro-services. |
| **WebRTC** | Aucun besoin pair-à-pair (audio/vidéo). |
| **RAG / évaluation de modèles LLM** | Le produit ne porte aucune fonctionnalité d'IA en runtime ; il n'y a pas de modèle à évaluer. Le développement *assisté* par IA relève du cadre de travail, pas du produit. |

## Extensions tracées (au-delà du scope RealWorld standard)

Certaines pratiques du référentiel n'ont pas d'accroche dans RealWorld mais valent une
démonstration *bonus* — elles sont tracées en issue plutôt qu'improvisées :

- **Communication temps réel (SSE)** — [issue #18](https://github.com/kamangacode/conduit-fullstack/issues/18).

## Ce qui est prévu (pas exclu — planifié)

Le durcissement production-grade (SAST/SBOM, Helmet/CSP, rate limiting, chiffrement PII,
observabilité pino/OTel, sondes de santé, release automatisée, déploiement, i18n,
accessibilité axe-core, budgets Core Web Vitals) est **au périmètre** et arrive par
phases. Ne pas confondre *pas encore livré* et *hors périmètre* : le
[threat model](../security/threat-model.md) marque explicitement, pour chaque menace,
ce qui est *couvert*, *prévu* ou *accepté*.
