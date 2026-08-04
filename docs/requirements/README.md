# Référentiel d'exigences (REQ-as-code)

Les exigences de Conduit sont versionnées ici, avec le code qu'elles gouvernent.
Une exigence n'est pas une note d'intention : c'est un document au **frontmatter
validé**, dont les critères d'acceptation portent des identifiants que les tests
reprennent en préfixe. C'est ce qui rend la question « ce critère est-il prouvé
par un test ? » mécaniquement décidable.

**La convention** (quand créer un REQ, comment le faire évoluer, nommage des
tests) vit dans [`.claude/rules/20-requirements-docs-as-code.md`](../../.claude/rules/20-requirements-docs-as-code.md).
Cette page ne la redécrit pas — elle documente la mécanique de ce dossier.

## Structure

```
docs/requirements/
├── _template.md              # gabarit — validé à chaque exécution du contrôle
├── _scripts/
│   ├── schema.ts             # schéma Zod du frontmatter (pur, sans I/O)
│   └── validate.ts           # validation + contrôles d'intégrité sur disque
├── functional/{domaine}/REQ-{DOMAINE}-{NNN}.md
└── non-functional/{domaine}/REQ-{DOMAINE}-{NNN}.md
```

L'emplacement d'un fichier **est** une donnée : `{type}/{domain}/{id}.md` doit
correspondre au frontmatter. Sans cette contrainte, un REQ déclaré `functional`
pourrait dormir dans `non-functional/`, et toute agrégation par type mentirait.

## Écrire un REQ

1. Choisir l'identifiant : `REQ-{DOMAINE}-{NNN}`, numéro **jamais réutilisé**
   dans le domaine, même après passage en `deprecated`.
2. Copier [`_template.md`](_template.md) vers `{type}/{domain}/{id}.md`.
3. Renseigner le frontmatter. La liste des champs et leurs contraintes font foi
   dans [`_scripts/schema.ts`](_scripts/schema.ts) — le schéma est commenté, il
   n'est pas recopié ici pour éviter deux sources qui divergeront.
4. Écrire le corps : contexte, règles, hors périmètre. Ce que le frontmatter ne
   peut pas dire, et qui permet de trancher un cas limite en revue.
5. Vérifier : `pnpm requirements:validate`.

Passer un REQ en `status: implemented` **engage** : le contrôle exige alors des
`implementation.files` et `implementation.tests` renseignés, et refuse tout
chemin qui n'existe pas sur le disque.

## Toolchain

```bash
pnpm requirements:validate    # forme (Zod) + intégrité (emplacement, unicité, liens)
pnpm requirements:matrix      # matrice exigence → test + rapport d'orphelins
pnpm requirements:coverage    # couverture AC-level, sur la sortie standard
pnpm requirements:verify      # vérifie que validateur et matrice disent bien la vérité
pnpm requirements:typecheck   # tsc sur _scripts/ — hors workspaces, donc hors `pnpm typecheck`
```

- `requirements:validate` est **bloquant** : lefthook pre-commit (sur les
  fichiers `docs/requirements/**`) et job CI `Requirements`.
- `requirements:verify` ([`scripts/verify-requirements-validator.sh`](../../scripts/verify-requirements-validator.sh))
  confronte le validateur à un référentiel de fixtures : un contrôle positif
  (un référentiel conforme doit passer) et un cas par mode de défaillance. Un
  validateur qui accepterait tout est une panne silencieuse — c'est le seul mode
  de défaillance qu'aucune relecture ne rattrape.

## Matrice de traçabilité

`requirements:matrix` déduit le lien exigence → test du **nommage** :
`describe('REQ-ARTICLE-001 …')` et `it('AC-1: …')`. Une convention de nommage
que ne lit aucun outil n'est qu'une politesse ; lue par le générateur, elle
devient une donnée exploitable.

La sortie va dans `_generated/`, **non versionné** : un artefact dérivé ne peut
pas être périmé s'il n'est jamais stocké ([ADR 005](../adr/005-matrice-de-tracabilite-generee.md)).
La CI n'en fait pas un gate — elle publie la couverture dans le résumé du run.
Un seuil de couverture ne deviendra bloquant qu'une fois calibré sur des données
réelles (rule 21).
