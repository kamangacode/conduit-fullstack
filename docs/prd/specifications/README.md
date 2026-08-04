# Spécifications RealWorld / Conduit (local)

> Copie Markdown verbatim des spécifications officielles RealWorld, rapatriées depuis le dépôt [`gothinkster/realworld`](https://github.com/gothinkster/realworld) (`docs/src/content/docs/`).
> Source amont : https://realworld-docs.netlify.app/
> Date de récupération : 2026-06-04.
>
> Le PRD synthétisé et adapté à nos 5 repos est dans [`../PRD-conduit.md`](../PRD-conduit.md). Ces fichiers-ci sont la **spec brute de référence**.

## Index

### Vue d'ensemble
- [`introduction.md`](introduction.md) - présentation de RealWorld / Conduit
- [`implementation-creation/introduction.md`](implementation-creation/introduction.md)
- [`implementation-creation/expectations.md`](implementation-creation/expectations.md) - ce qu'une implémentation doit respecter
- [`implementation-creation/features.md`](implementation-creation/features.md) - liste des fonctionnalités

### Backend
- [`backend/introduction.md`](backend/introduction.md)
- [`backend/openapi.yml`](backend/openapi.yml) - **contrat OpenAPI 3.1.0 officiel** (RealWorld Conduit API v2.0.0), source machine-readable de l'API
- [`backend/endpoints.md`](backend/endpoints.md) - **tous les endpoints API** (version lisible)
- [`backend/api-response-format.md`](backend/api-response-format.md) - **formats JSON de réponse**
- [`backend/error-handling.md`](backend/error-handling.md) - codes et format d'erreur
- [`backend/cors.md`](backend/cors.md)
- [`backend/tests.md`](backend/tests.md) - comment tester un backend
- [`backend/hurl.md`](backend/hurl.md) - suite Hurl (source de vérité des tests API)
- [`backend/bruno.md`](backend/bruno.md) - collection Bruno (générée)
- [`backend/postman.md`](backend/postman.md) - (héritage Postman)

### Frontend
- [`frontend/api.md`](frontend/api.md) - comment consommer l'API
- [`frontend/routing.md`](frontend/routing.md) - routes des pages
- [`frontend/templates.md`](frontend/templates.md) - gabarits HTML / fonctionnalités UI (le plus gros fichier)
- [`frontend/styles.md`](frontend/styles.md)
- [`frontend/tests.md`](frontend/tests.md)

### Mobile
- [`mobile-specs/introduction.md`](mobile-specs/introduction.md)

## Notes

- Les liens internes dans ces fichiers (du type `/specifications/backend/...`) sont **absolus relatifs au site amont** et ne résolvent pas en local. Pour naviguer en local, utiliser cet index.
- Le contrat OpenAPI officiel est récupéré en local dans [`backend/openapi.yml`](backend/openapi.yml) (provient de `specs/api/openapi.yml` du dépôt amont, pas de `docs/`).
- Pour rafraîchir : re-télécharger depuis `gothinkster/realworld` (`docs/src/content/docs/`).
