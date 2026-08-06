---
id: REQ-WEB-004
title: Mettre à jour son compte depuis la page de paramètres
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (route /settings), §7.1 (PUT /user) ; markup RealWorld `.settings-page`"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur connecté arrivant sur /settings"
    when: "la page s'affiche"
    then: "les champs sont pré-remplis avec son compte courant, mot de passe excepté"
  - id: AC-2
    given: "un champ modifié et les autres laissés tels quels"
    when: "le formulaire est soumis"
    then: "la requête ne transporte que ce qui change, et les champs non touchés conservent leur valeur"
  - id: AC-3
    given: "un mot de passe laissé vide"
    when: "le formulaire est soumis"
    then: "le mot de passe n'est pas transmis — un champ vide signifie « ne pas changer », jamais « effacer »"
  - id: AC-4
    given: "une mise à jour réussie"
    when: "la réponse arrive"
    then: "la session porte le compte à jour, et la barre de navigation reflète immédiatement le nouveau username"
  - id: AC-5
    given: "un visiteur anonyme"
    when: "il ouvre /settings"
    then: "il est redirigé vers la page de connexion plutôt que de voir un formulaire vide"
  - id: AC-6
    given: "un utilisateur connecté"
    when: "il actionne la déconnexion depuis cette page"
    then: "la session est fermée et il repasse en anonyme"
  - id: AC-7
    given: "un utilisateur dont la session expire pendant qu'il édite ses paramètres"
    when: "l'enregistrement répond 401 et la session est purgée"
    then: "le formulaire reste affiché avec le message d'expiration et sa saisie, au lieu de disparaître sans explication"
  - id: AC-8
    given: "un utilisateur connecté sur /settings qui modifie sa bio, son image ou les deux"
    when: "l'enregistrement répond 200"
    then: "la page navigue vers /profile/{username}, en prenant le username du compte renvoyé par l'API et non celui de l'état initial"
  - id: AC-9
    given: "un enregistrement qui échoue — 401, 500 ou panne de transport"
    when: "la réponse arrive"
    then: "aucune navigation n'a lieu : le formulaire reste affiché avec sa saisie et son message"
  - id: AC-10
    given: "le profil visé (ancien ou nouveau username selon qu'il y a renommage), un article dont ce compte est l'auteur, ou un fil de commentaires où il a écrit, déjà en cache juste avant l'enregistrement"
    when: "l'enregistrement réussit"
    then: "toute copie du compte encore en cache est marquée périmée : aucun écran affiché ensuite ne montre une valeur — profil, auteur d'article ou auteur de commentaire — lue avant l'enregistrement"
implementation:
  files:
    - apps/web/src/components/SettingsForm.tsx
    - apps/web/src/app/settings/page.tsx
    - apps/web/src/lib/content-query.ts
  tests:
    - apps/web/src/components/SettingsForm.spec.tsx
    - apps/web/src/app/settings/page.spec.tsx
    - apps/web/src/lib/content-query.spec.ts
related:
  issues: [7, 14]
  requirements:
    - REQ-WEB-002
    - REQ-WEB-006
    - REQ-WEB-007
    - REQ-USER-004
  adrs:
    - "012"
    - "015"
    - "017"
---

# REQ-WEB-004 — Mettre à jour son compte depuis la page de paramètres

## Contexte

C'est la première page entièrement personnelle du front : rien n'y est
affichable pour un anonyme, ce qui en fait un Client Component sans nuance
(ADR 012).

AC-3 est le critère central, et il prolonge une distinction déjà tranchée côté
API. `PUT /api/user` accepte une mise à jour **partielle** : une clé absente
signifie « ne pas toucher » ([REQ-USER-004](../user/REQ-USER-004.md)). Or le
formulaire de RealWorld affiche un champ mot de passe **toujours vide** — il
n'est pas pré-rempli, pour de bonnes raisons. Envoyer sa valeur telle quelle
transmettrait donc une chaîne vide à chaque enregistrement, et le compte
finirait avec un mot de passe vide ou une erreur de validation, selon ce que
l'API tolère. Le champ vide doit être **retiré de la requête**, pas transmis.

AC-2 étend le même raisonnement aux autres champs : n'envoyer que ce qui change
évite d'écraser une valeur modifiée entre-temps depuis un autre onglet.

AC-4 relie cette page à la barre de navigation : le username fait partie du lien
de profil, et une session non rafraîchie afficherait l'ancien jusqu'au prochain
rechargement — un décalage que l'utilisateur attribue à un échec de
l'enregistrement.

AC-8 ferme la boucle que AC-4 laissait ouverte. Enregistrer et **rester** sur le
formulaire ne donne à l'utilisateur aucun signe que quelque chose s'est produit :
le contrat RealWorld fait donc atterrir sur `/profile/{username}`, où la valeur
enregistrée est visible. Le username utilisé est celui **de la réponse**, pas
celui de l'état initial — celui qui vient de se renommer serait sinon envoyé vers
une page qui n'existe plus.

AC-9 est la contrepartie stricte d'AC-7, et la seule raison pour laquelle ce
dernier ne régresse pas : la navigation est conditionnée au succès par la
structure du code — elle suit l'`await` de l'appel, donc un rejet la
court-circuite — et non par une condition qu'un remaniement pourrait déplacer.

AC-10 traite un effet du cache et non de l'affichage. Le profil est servi par
TanStack Query avec un `staleTime` de trente secondes
([ADR 015](../../../adr/015-prefetch-serveur-et-hydratation-des-listes.md)) :
sans invalidation, l'utilisateur qui enregistre deux fois de suite — renseigner
une bio, puis l'effacer — arrive sur son profil et y lit encore la valeur
précédente. Le symptôme se lit comme un enregistrement perdu, alors que l'API a
bien reçu la mise à jour. Un renommage double le risque plutôt que de le
déplacer : l'entrée à invalider n'est pas seulement celle du nouveau username
(souvent absente du cache, une page jamais visitée), mais aussi celle de
l'ancien — la plus susceptible d'être encore fraîche, l'utilisateur venant
justement de son propre profil.

Le profil n'est pas la seule copie du compte en cache. Un article **comme un
commentaire** embarque un instantané de son auteur (username, bio, image) plutôt
qu'une référence — c'est le format de l'API, pas un choix du front — et cet
instantané vit dans le détail d'un article, dans les flux qui le listent et dans
le fil de commentaires qui l'accompagne. N'invalider que `profileQueryKey`
laisserait ces copies périmées visibles ailleurs qu'à l'écran de profil : la méta
d'un article déjà en cache, ou l'avatar sous un commentaire, continuerait
d'afficher l'ancienne valeur. `invalidateAuthorCaches`
(`apps/web/src/lib/content-query.ts`) couvre les quatre familles de clés d'un
même geste — profil, détail d'article, flux, commentaires — sur l'ancien username
comme sur le nouveau.

## Règles

- Route : `/settings` (PRD §5), authentification requise.
- Validation : `updateUserDtoSchema` de `@repo/shared`
  ([REQ-USER-001](../user/REQ-USER-001.md)).
- Champ vide ⇒ clé absente de la requête, jamais chaîne vide. Effacer une valeur
  **renseignée** reste un changement : la clé part avec la chaîne vide, que
  `updateUserDtoSchema` normalise en `null` (ADR 017, qui amende l'ADR 004 sur ce
  point précis en déplaçant la normalisation du vide de la persistance vers le
  contrat partagé).
- La navigation vers le profil appartient à la **page**, pas au formulaire :
  `SettingsForm` ne connaît ni l'API ni le routeur, et ne doit pas l'apprendre.
- Markup RealWorld : `.settings-page`, formulaire à cinq champs, bouton de
  déconnexion en pied de page (rule 11).
- La redirection d'un anonyme se fait côté client, après montage : le serveur ne
  connaît pas la session (ADR 012).

## Hors périmètre

- La suppression de compte : absente du contrat RealWorld.
- La consultation du profil public d'autrui : [REQ-WEB-005](REQ-WEB-005.md).
- Le rendu de la barre de navigation elle-même : [REQ-WEB-006](REQ-WEB-006.md).
