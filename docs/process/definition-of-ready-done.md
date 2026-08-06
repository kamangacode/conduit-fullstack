# Definition of Ready & Definition of Done

> Deux checklists partagées : *quand une unité de travail est prête à être prise*, et
> *quand elle est réellement terminée*. Elles rendent explicite ce qui, sinon, reste un
> jugement implicite — et se branchent sur les garde-fous déjà présents dans le dépôt.

## Definition of Ready (DoR)

Une issue est **prête** quand :

- [ ] le **problème** est formulé (pas seulement la solution) ;
- [ ] le **périmètre** est borné, et ce qui est hors périmètre est nommé ;
- [ ] les **critères d'acceptation** sont énoncés en `AC-n` (Given/When/Then) et
      rattachables à une exigence [`docs/requirements/`](../requirements/) — ou l'absence
      d'exigence est justifiée ;
- [ ] les **décisions d'architecture** non triviales sont identifiées (ADR à créer) ;
- [ ] les **dépendances** (autres issues, migrations) sont connues.

## Definition of Done (DoD)

Une unité est **terminée** quand :

- [ ] le **code et ses tests** sont livrés ensemble, par couche (domaine / application /
      infrastructure / interface) — pas de test tautologique ;
- [ ] chaque **critère d'acceptation** est prouvé par un test nommé `AC-n` (couverture
      vérifiée par `pnpm requirements:matrix`, zéro orphelin) ;
- [ ] toutes les **portes de qualité** sont vertes : `lint`, `typecheck`, `test`,
      `test:integration`, `knip`, `depcruise`, `requirements:validate` ;
- [ ] les **frontières hexagonales** sont respectées (le `domain` reste pur) ;
- [ ] la **sécurité** de la tranche est traitée (validation d'entrée, autorité serveur,
      anti-IDOR le cas échéant) ;
- [ ] la **documentation** qui devient périmée est mise à jour dans la même PR (ADR,
      README, exigences, diagrammes) ;
- [ ] la **CI est verte** (constatée, jamais supposée) et la PR cible `staging`.

> Ces critères ne sont pas déclaratifs : la plupart sont **exécutables** (un job CI ou un
> hook les vérifie). Le DoD est donc en grande partie tenu par la machine, pas par la
> bonne volonté.
