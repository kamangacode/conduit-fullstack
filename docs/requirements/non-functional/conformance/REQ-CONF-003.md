---
id: REQ-CONF-003
title: Le harnais e2e fournit le jeu de données minimal que la suite suppose
type: non-functional
domain: conformance
status: implemented
priority: must
source: "PRD §15.2 (specs Playwright officielles) ; suite e2e officielle `user-fetch-errors.spec.ts` (401 sur /api/user, article attendu sur l'accueil) ; ADR 018"
acceptance_criteria:
  - id: AC-1
    given: "une base e2e vidée par le harnais"
    when: "la suite démarre"
    then: "au moins un article publié existe, de sorte qu'un test lisant le flux global sans le mocker trouve un `.article-preview`"
  - id: AC-2
    given: "ce jeu de données"
    when: "il est créé"
    then: "il l'est par l'API — le harnais n'ouvre aucune connexion directe à la base pour écrire — et il est idempotent : deux exécutions successives ne produisent ni doublon ni échec"
  - id: AC-3
    given: "un run où la création du jeu de données échoue"
    when: "le harnais poursuit"
    then: "il sort en code non nul avant d'exécuter la suite, plutôt que de laisser l'absence de données passer pour un défaut du front"
  - id: AC-4
    given: "la suite exécutée deux fois d'affilée sur la même base"
    when: "on compare les deux verdicts"
    then: "le test qui lit le flux global sans mock rend le même résultat — il ne dépend d'aucun article créé par un autre fichier de specs"
  - id: AC-5
    given: "`social.spec.ts`, qui vise en dur le compte `johndoe` que la suite dit présent sur la démo publique"
    when: "le harnais démarre"
    then: "ce compte existe et a publié au moins un article, de sorte que `/profile/johndoe` rende un profil et non la coquille « profil introuvable »"
implementation:
  files:
    - scripts/e2e-seed.mjs
    - scripts/test-e2e.sh
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-e2e-seed.sh
related:
  issues: [12, 15]
  requirements:
    - REQ-CONF-002
    - REQ-WEB-002
  adrs: ["018", "019"]
---

# REQ-CONF-003 — Le harnais e2e fournit le jeu de données minimal que la suite suppose

## Contexte

[REQ-CONF-002](REQ-CONF-002.md) a rendu la suite e2e officielle exécutable
contre notre pile. Elle a aussi mis au jour une dépendance que la suite ne
déclare nulle part : **certains de ses tests supposent une API peuplée**.

Le cas est isolé et net. `user-fetch-errors.spec.ts`, *should handle 401
Unauthorized on /api/user*, mocke le seul appel `/user` puis, une fois la purge
constatée, assert que `.article-preview` est visible sur l'accueil. Le flux
global n'est **pas** mocké : il part vers l'API réelle du run. Or
`scripts/test-e2e.sh` fait un `TRUNCATE` complet avant de démarrer — pour de
bonnes raisons, un résidu du run précédent faisant échouer la suite sur des
chemins sans rapport avec la conformité — et ce fichier de specs ne crée aucun
article. La page affiche donc, très correctement, « No articles are here...
yet. », et l'assertion échoue.

Aucune modification de `apps/web/src` ne rend ce test vert : ce qui manque n'est
pas un comportement, c'est une donnée. En amont, la suite vise une démo publique
qui contient des articles depuis toujours ; notre harnais défait volontairement
cette propriété et ne la restitue pas.

**AC-5 est la seconde occurrence, découverte un lot plus tard.** La suite lit
`API_MODE`, dont le défaut est **vrai** : elle se croit donc opposée à la démo
publique, et trois tests de `social.spec.ts` ciblent `johndoe` en dur plutôt que
d'inscrire un second compte — « API mode: johndoe exists with articles on the
demo backend », écrit dans le fichier lui-même. Forcer `API_MODE=false` serait le
mauvais remède : ce drapeau **saute** quatre fichiers entiers
(`error-handling`, `user-fetch-errors`, `xss-security`, `health`) et une poignée
de tests ailleurs, soit une désactivation de notre fait que
[REQ-CONF-002](REQ-CONF-002.md) AC-1 interdit. Le bon remède est le même que
pour AC-1 : rendre l'environnement conforme à ce que les assertions supposent.
Notre harnais tient déjà lieu de démo publique pour l'hôte d'API (ADR 019) ; il
lui manquait seulement le compte que cette démo a toujours eu.

**Ce que la première rédaction avait manqué.** AC-1 était née d'**un** test qui
supposait une API peuplée, et la règle « un seul auteur » en avait fait une
propriété du jeu de données plutôt qu'une réponse à ce test-là. Une supposition
d'environnement non déclarée par la suite ne se découvre qu'en l'exécutant : la
seconde s'est révélée en rejouant `social.spec.ts`, où le symptôme —
« Profile not found » — désignait le front alors que la donnée manquait.

**Fournir cette donnée n'est pas assouplir la suite.** Aucune assertion ne
bouge, aucun timeout ne change, aucun fichier vendoré n'est retouché
([ADR 018](../../../adr/018-conformite-e2e-suite-officielle-vendoree.md)) : seul
l'environnement que les assertions supposent est rendu vrai. La frontière est
la même que pour l'[ADR 019](../../../adr/019-alignement-de-l-hote-d-api-pour-la-suite-e2e.md),
qui rend intercepté un hôte que la suite fige — on répare le **montage**, jamais
le test.

## Règles

- **Par l'API, jamais par la base.** Un `INSERT` direct produirait un état que
  l'API n'aurait jamais accepté (slug mal dérivé, mot de passe non haché,
  colonne oubliée à la prochaine migration) et le premier symptôme serait un
  échec e2e attribué au front. Passer par l'API, c'est aussi éprouver au
  passage que l'API du run répond — un contrôle gratuit qui arrête le harnais
  au bon endroit.
- **Idempotent.** La base est vidée à chaque run mais rien ne le garantit à un
  appelant : `pnpm conformance:e2e` peut être relancé, et un run CI rejoué
  contre un service Postgres réutilisé. Le jeu de données se re-crée sans
  doublon ni erreur.
- **Bruyant en cas d'échec** (AC-3). Un jeu de données absent produit un échec
  e2e parfaitement crédible — « le front n'affiche pas les articles » — qui coûte
  une demi-heure de diagnostic sur le mauvais fichier. Le harnais s'arrête donc
  avant la suite, avec le vrai motif.
- **Minimal, et minimal veut dire « ce que la suite nomme ».** Un article par
  compte, et aucun compte qui ne soit exigé par une assertion : `e2e-seed-author`
  pour AC-1, `johndoe` pour AC-5. Le jeu de données n'est pas une fixture
  applicative — plus il grossit, plus il devient une dépendance cachée des autres
  fichiers de specs, et plus l'ordre d'exécution finit par compter. La règle
  d'origine disait « un seul auteur » ; c'était la bonne intention exprimée par
  un chiffre, et le chiffre a été amendé quand un second compte s'est avéré
  **nommé en clair** par la suite (voir Contexte).

## Hors périmètre

- **Les comptes et articles que la suite crée elle-même** par ses helpers : ils
  restent sous sa responsabilité, et le jeu de données ne cherche ni à les
  anticiper ni à les remplacer.
- **La bascule du job e2e en gate**, qui reste un geste ultérieur et délibéré
  ([REQ-CONF-002](REQ-CONF-002.md) AC-5).
- **La conformité du front**, objet des REQ-WEB fonctionnels. Cette exigence ne
  rend pas un test vert par correction : elle enlève une raison de rougir qui
  ne parlait de rien.

## Couverture

AC-1, AC-4 et AC-5 se lisent dans l'exécution de la suite : le seeding précède le
lancement, donc le flux global n'est jamais vide au démarrage, le test ne
dépend d'aucun article produit par un autre fichier — ce qui importe, la suite
étant parallélisée et son ordre non garanti — et les six tests de
`social.spec.ts` passent, ce qu'aucun d'eux ne pouvait faire tant que `johndoe`
manquait.

AC-2 et AC-3 sont prouvés par `scripts/verify-e2e-seed.sh`, qui oppose
`scripts/e2e-seed.mjs` à un **stub d'API** plutôt qu'à l'API réelle : le script
y est exécuté deux fois d'affilée (aucun doublon créé au second passage, code de
sortie nul les deux fois), puis contre un stub qui refuse, où l'on exige un code
non nul. Un stub rend ces deux propriétés observables en quelques secondes, là
où la vraie pile demanderait Docker, deux builds et une base.
