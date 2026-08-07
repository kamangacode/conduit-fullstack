# Leçons — conduit-fullstack

> Registre post-incident (rules 01 et 21). Une entrée par défaut qui a échappé à
> la revue, avec assez de contexte pour ne pas se reproduire à l'identique.
>
> Trois registres, trois usages : un **choix** va en ADR, un **fait de contexte**
> dans la mémoire de session, un **échec évité** ici.

---

## 2026-08-07 — Une garde de session qui déborde sur le contenu public

**Symptôme.** Sur la branche du lot #15, le commit `a4efb02` — 677 insertions
sur 12 fichiers, sous un message `fix: address review findings` — a fait tomber
la suite e2e de **138/139 à 104/139** : 34 échecs et un test instable, répartis
sur sept fichiers dont `xss-security`, `null-fields` et `error-handling`, que le
lot ne touchait pas. Les 35 échecs partageaient une seule signature : le contenu
ne s'affichait jamais (`input[name="title"]` introuvable, `.article-preview`
résolu à 0 élément, `button:has-text("Follow")` jamais visible). Les pages
restaient sur l'écran d'attente.

**Ce qui a failli se passer.** Le run de CI a conclu **vert**. Le job `E2E` est
en `continue-on-error` (ADR 018) : sa conclusion ne dit rien du verdict de la
suite, qui ne se lit que dans son log (`N passed`, `N failed`). Un seul signal
distinguait ce run des précédents sans ouvrir le log — sa durée, 18 min 48 s
contre 3 min. Sans la lecture du verdict, une régression de 35 tests partait au
merge sous un run vert.

**Cause racine.** Le correctif élargissait la garde `enabled: status !== 'pending'`
pour fermer un trou d'identité de cache, sans traiter deux constats que la revue
avait pourtant **écrits à l'avance** dans le même lot : « `GET /user` qui pend
(et non qui échoue) fige désormais un contenu public sur l'écran d'attente, sans
issue » et « la branche `isPending` retient la liste préchargée : le gate de
session annule l'ADR 015 sur la page de profil ». Une garde posée pour une
ressource relative au lecteur retenait du contenu qui ne l'est pas.

Deux enseignements distincts. D'abord, un constat de revue qui **décrit un mode
de panne** vaut plus qu'un constat qui décrit un défaut : il prédit ce que le
correctif va casser, et l'ignorer revient à se faire prévenir pour rien. Ensuite,
un travail d'architecture — ici indexer ou purger le cache par identité de
lecteur — ne se traite pas dans une ronde de correcteur sous un commit `fix:` :
il lui faut son propre cadrage et sa porte de conception. C'est le sens du lot
dédié ouvert à la place. Commit révoqué par `reset --hard` puis
`push --force-with-lease` ; le SHA `a4efb02` reste consultable au reflog si son
contenu doit être repris.

---

## 2026-08-06 — L'inventaire d'une issue périme plus vite que l'issue

**Symptôme.** L'issue #12 annonçait 24 tests rouges sur `error-handling.spec.ts`
et `user-fetch-errors.spec.ts`, et son cadrage était dimensionné là-dessus :
« le plus gros lot des cinq de l'épique ». À la prise en main, quatre commits
postérieurs à sa rédaction avaient déjà traité l'essentiel de son contenu —
`adca6b9` (mode indisponible, message de transport, coquilles de page),
`f51037c` (chargement client), `fed7f3a` (bouton de favori) et `2310ce8` (page
de paramètres qui survit à la purge). Le reliquat réel tenait à **trois
coutures**, dont une qui ne se corrige pas dans `apps/web/src`.

**Ce qui a failli se passer.** Travailler d'après le chiffre de l'issue, c'est
partir chercher 24 défauts dont 18 n'existent plus. Le coût n'est pas seulement
du temps perdu : c'est surtout la tentation de « corriger » du code déjà correct
pour faire baisser un compteur, et de conclure à la fin que le lot a bien traité
ses 24 tests.

**Cause racine.** Une issue est un **instantané daté**. Sur une épique où
plusieurs lots partagent la même surface (`apps/web`) et où les correctifs
tombent dans l'ordre où les causes sont comprises, son inventaire se périme au
premier commit voisin. Ici, la seule mesure disponible dans le dépôt
(`apps/web/test-results/.last-run.json`) précédait elle-même deux des quatre
commits correctifs — donc même la mesure était en retard sur le code.

**Règle à appliquer.** Sur un lot dont l'énoncé est un **compte d'échecs**, la
première slice ne produit pas de code : elle **re-mesure**. Et le cadrage écrit
d'où vient le chiffre qu'il cite, avec sa date, pour qu'un lecteur sache
immédiatement s'il est encore vrai. Corollaire : ce que le lot doit prouver n'est
jamais « N tests sont passés au vert », mais « aucun test vert ne l'est devenu
rouge, et le reliquat a diminué » — la seule formulation qui reste juste quand un
autre lot corrige la même surface en parallèle.

**Ce que ça ne dit pas.** Que l'issue était mal écrite. Elle était juste le jour
où elle a été écrite. C'est le fait qu'elle **ait l'air** d'être encore vraie qui
est le piège : rien dans son texte ne signale sa date de péremption.

---

## 2026-08-06 — `$!` rend le sous-shell, pas le serveur : un run e2e a éprouvé le front du run précédent

**Symptôme.** Après avoir aligné l'URL d'API du navigateur sur l'hôte que la
suite intercepte (ADR 019), la relance des deux fichiers concernés rendait **45
tests rouges** — c'est-à-dire tous. Les messages décrivaient des défauts de
conformité plausibles : messages d'erreur absents, formulaires qui ne réagissent
pas.

**Ce n'était pas le front qu'on testait.** Perdue au milieu de la sortie, une
trace `EADDRINUSE` sur le port 3100. Le `next start` de ce run n'avait jamais
démarré ; le port répondait quand même, parce qu'un serveur d'un run précédent
l'occupait toujours. Le `wait_for` du script, qui interroge l'URL et non le
processus, a donc conclu que le front était prêt — et la suite s'est exécutée
contre un artefact **compilé avec l'ancienne URL d'API**, exactement celle dont
on venait de démontrer qu'elle empêche les mocks de matcher.

**Cause racine.** `test-e2e.sh` lance ses serveurs dans des sous-shells :

```sh
( cd apps/web; … pnpm exec next start … ) &
web_pid=$!
```

`$!` rend le PID du **sous-shell**, pas celui de `next`. Le trap tuait donc le
parent et laissait l'enfant vivant, orphelin, toujours à l'écoute. Le run
précédent s'était terminé « proprement » en laissant deux serveurs derrière lui,
et rien dans son code de sortie ne le disait.

**Correction.** Deux garde-fous, dans cet ordre d'importance :

1. **Refus au démarrage** si l'un des trois ports est déjà occupé. C'est le
   contrôle qui compte : il transforme une dégradation silencieuse en erreur
   nommée, et il protège aussi contre un serveur laissé par autre chose que ce
   script.
2. **Nettoyage par port** dans le trap, en plus du `kill` des PID enregistrés :
   ce qui écoute encore sur les ports du run est arrêté.

**Le motif à retenir.** *Attendre qu'un port réponde ne prouve pas que le
processus qu'on vient de lancer est celui qui répond.* Le même raisonnement vaut
pour une base de données, un cache ou une file : la disponibilité d'une adresse
n'est pas l'identité de ce qui s'y trouve. C'est une variante de la leçon
`initdb` (serveur temporaire pris pour le définitif) — et la deuxième fois que
ce dépôt se fait piéger par une sonde qui interroge une **adresse** au lieu d'un
**processus**.

---

## 2026-08-05 — Un commentaire dans `biome.json` désactive la config **sans rien dire**

**Symptôme.** En ajoutant deux exclusions à `files.includes`, chacune précédée
d'un commentaire `//` expliquant le pourquoi — comme la rule 18 le demande pour
tout fichier destiné à être cité publiquement — `pnpm lint` est passé de **170
fichiers analysés à plusieurs centaines** et de 0 à plusieurs milliers
d'erreurs, sur `node_modules` et les artefacts de build.

*(L'ordre de grandeur plutôt qu'un chiffre : la mesure initiale relevait 677
fichiers, une reproduction ultérieure 757. Le compte exact dérive avec le
contenu du dépôt, le mécanisme non — un registre qui fige un chiffre
irreproductible s'auto-décrédibilise.)*

**Fausse piste — et elle a coûté une mauvaise décision.** Le changement
contenait aussi l'activation de `vcs.useIgnoreFile`, essayée pour faire
respecter `.gitignore` par biome. La retirer n'a rien changé : le compte est
resté à plusieurs centaines. On en a conclu que l'option *élargissait* le
périmètre, et on l'a écartée au profit d'une exclusion écrite à la main.

**C'était faux.** Les commentaires étaient encore présents lors de ce second
essai, donc `files.includes` restait illisible dans les deux cas — l'option
n'a jamais été mesurée dans des conditions propres. Testée seule, une fois les
commentaires retirés, elle donne exactement le même résultat que l'exclusion
manuelle (170 fichiers). Le raisonnement « je retire X, le symptôme persiste,
donc X est hors de cause » ne tient que si **rien d'autre** ne produit le même
symptôme. Ici deux causes candidates coexistaient, et l'une masquait l'innocence
de l'autre.

**Cause racine.** `biome.json` est lu en JSON **strict**. Un commentaire ne
provoque pas une erreur de configuration : la clé `files.includes` devient
illisible, biome retombe sur son périmètre par défaut et **analyse tout**, y
compris `node_modules` et les artefacts de build. Le garde-fou ne dit pas
« ta config est invalide », il dit « voici 2 385 erreurs » — le symptôme ne
désigne pas sa cause, et le réflexe naturel est d'aller chercher une régression
dans le code.

**Ce qu'on en tire.** Une config qui échoue en élargissant silencieusement son
périmètre est plus dangereuse qu'une config qui refuse de démarrer : la seconde
s'arrête sur son vrai problème, la première envoie déboguer ailleurs. Le tell
qui aurait fait gagner du temps est le **nombre de fichiers analysés**, imprimé
à chaque exécution et qu'on lit rarement.

Conséquence pratique : le *pourquoi* des exclusions de `biome.json` ne peut pas
vivre dans le fichier. Il vit dans le message de commit et ici. Le rendre
commentable supposerait de renommer en `biome.jsonc`, ce qui déplacerait un
chemin référencé par `scripts/verify-biome-hardfail.sh` — arbitrage à faire
séparément, pas au détour d'une slice front.

**Second enseignement, sur la forme des exclusions.** La première rédaction
excluait `apps/web/public` **en entier** pour faire taire une seule règle sur un
seul fichier (`noSvgWithoutTitle` sur l'avatar vendoré) — `styles.css` étant
déjà couvert par `!**/*.css`. Un fichier ajouté plus tard dans ce répertoire
aurait échappé au lint sans le moindre signal. C'est le même mode d'échec que
ci-dessus — un périmètre qui s'élargit en silence — obtenu par une autre voie.
Une exclusion se pose au fichier, pas au répertoire, tant qu'un seul fichier la
justifie.

---

## 2026-08-05 — La matrice de traçabilité rapproche des **libellés**, pas des comportements

**Symptôme.** Revue de F4 : deux tests portaient un préfixe `AC-n:` dont ils ne
prouvaient pas le critère. `session.spec.tsx` annonçait « purge la session sur
une réponse 401 » et cliquait sur le bouton de déconnexion manuelle —
c'est-à-dire re-testait AC-3. `SettingsForm.spec.tsx` annonçait AC-4 (« la
session porte le compte à jour ») et vérifiait l'affichage des erreurs, libellé
recopié depuis `AuthForm.spec.tsx` où AC-4 désigne autre chose.

Conséquence : **REQ-WEB-002 AC-4 était marqué `implemented` alors qu'aucun code
ne réalisait la purge**. Le contrôle de sécurité n'existait pas, et un jeton
expiré laissait l'interface affirmer une identité que l'API ne reconnaissait
plus.

**Cause racine — et c'est la partie qui compte.** `requirements:matrix` rattache
un test à un critère par **la chaîne** `AC-n:` contenue dans le nom du `it()`.
Elle ne peut pas savoir ce que le test assert. Un libellé emprunté produit donc
une couverture *rapportée* de 100 % sur un critère *non couvert* — et le chiffre,
qui est là pour signaler les trous, les masque activement.

C'est la **quatrième** occurrence du même mode d'échec dans ce dépôt (cf. les
deux entrées ci-dessous, plus un test écrit à l'envers en F4 sur
`loginDtoSchema`). Les deux premières ont coûté un bug ; celle-ci a laissé passer
un contrôle de sécurité manquant. Écrire « faire attention » une troisième fois
n'y changerait rien.

**Ce qui marche, et qu'il faut faire systématiquement.** Le seul contrôle qui a
attrapé ces cas est le **sabotage** : supprimer la ligne testée et vérifier que
le test rougit. Il est déjà dans la rule 16 comme convention de revue ; ce que
F4 montre, c'est qu'il doit s'appliquer **à chaque critère marqué
`implemented`**, pas seulement aux endroits où l'on se sent incertain. Un test
qui survit à la suppression de son sujet ne prouve rien, quel que soit son nom.

**Contrôle complémentaire, non automatisable.** Avant de passer un REQ en
`implemented`, relire le `then:` du critère **à côté** de l'assertion du test.
Les deux défauts ci-dessus se voient en dix secondes par cette lecture, et
restent invisibles à toute vérification mécanique — la machine compare des
libellés, seul un humain compare des sens.

**Piste d'outillage envisagée puis écartée pour l'instant** : faire échouer la
matrice quand un `it('AC-n: …')` cite un REQ absent de `implementation.tests`.
Ça attraperait le libellé posé sur le mauvais fichier (le cas
`SettingsForm`/AC-4), pas le libellé posé sur le mauvais comportement dans le bon
fichier (le cas `session`/AC-4). Utile, donc, mais partiel — à ne pas prendre
pour une garantie.

---

## 2026-08-05 — Un garde-fou qui ne tombe que sous charge est un garde-fou qu'on contourne

**Symptôme.** Le job pre-push `migrations-apply` refusait le push sur « Postgres
n'est pas prêt après 30s », **en ayant rendu la main au bout de 2,45 secondes**.
Le message et la durée se contredisaient. Lancé seul, le même script passait —
trois fois de suite.

**Cause racine.** L'image Postgres démarre un serveur **temporaire** pendant
`initdb`, l'arrête, puis démarre le serveur définitif. `pg_isready` répond donc
« prêt » une première fois sur un serveur qui va disparaître. La boucle sortait
sur ce premier succès, et la vérification finale — un unique appel — tombait
dans la fenêtre de redémarrage.

**Ce qui l'a rendu difficile à voir.** Le défaut n'apparaissait que lorsque les
autres jobs pre-push tournaient **en parallèle** : l'initialisation ralentit
alors assez pour élargir la fenêtre. Isolé, le script était vert ; c'est
exactement la forme d'échec qu'on classe « flake » et qu'on contourne par un
`--no-verify`.

**Correction.** Exiger trois succès **consécutifs**, et remettre le compteur à
zéro au premier échec — un succès suivi d'un échec est la signature du
redémarrage post-`initdb`. Le message rapporte désormais le nombre de
vérifications consécutives obtenues.

**Règle à appliquer.** Quand une durée annoncée et une durée observée se
contredisent, c'est la boucle d'attente qu'il faut lire, pas la ressource
attendue. Et un contrôle qui interroge un service en démarrage doit vérifier
qu'il est **stable**, pas qu'il a répondu une fois.

**Ne pas faire.** Contourner le hook. Le contrôle avait raison de bloquer : il
signalait un vrai problème, dans sa propre logique. Passer outre aurait laissé
le défaut en place pour le prochain contributeur, sur une machine plus chargée.

---

## 2026-08-05 — Un test écrit d'après l'implémentation masque le défaut qu'il devait attraper

**Symptôme.** La lane d'intégration de la slice F3 est passée au vert du premier
coup, 37 tests sur 37. Parmi eux, celui-ci :

```ts
it('AC-2: persiste le nouveau slug quand le titre change', async () => {
  const updated = await articles.update(created.id, jake, { title: 'Did you train your dragon?' })
  expect(updated.slug.value).toBe('how-to-train-your-dragon') // ← l'ANCIEN slug
})
```

Le nom du test annonce une régénération ; l'assertion vérifie l'inverse. Il
passait parce qu'il décrivait fidèlement ce que le code faisait.

**Cause racine.** `ArticleRepository.update` prenait un `ArticleChanges` — les
seuls champs transmis par le client. Le slug n'en fait jamais partie : il n'est
pas un champ client, il est dérivé du titre. L'entité le régénérait donc
correctement dans `withChanges`, et **personne ne le persistait**. Un article
renommé gardait son ancienne URL, en contradiction avec R-1 et avec la spec
(« The slug also gets updated when the title is changed »).

Le défaut est né d'une frontière mal placée : un port dont le paramètre est
« ce que le client a envoyé » ne peut pas transporter ce que le domaine a
**calculé**.

**Ce qui l'a laissé passer.** Le test a été écrit en regardant le retour de
l'implémentation plutôt qu'en relisant le critère d'acceptation. C'est le même
mode d'échec qu'en F2 avec le préfixe `/api` absent : *les tests reproduisaient
l'oubli, parce qu'ils avaient été écrits d'après le code*. La couverture
progressait, la matrice de traçabilité comptait le critère comme couvert, et
l'écart au contrat restait entier.

**Correction.** `update(authorId, article: ArticleEntity)` : le repository reçoit
l'**état calculé par le domaine**, slug compris. L'`authorId` reste un paramètre
distinct — le lire depuis l'entité relue reviendrait à comparer une valeur avec
elle-même et le filtre anti-IDOR ne protégerait plus rien.

**Règle à appliquer.** Écrire l'assertion **depuis le fichier REQ**, pas depuis
le retour observé. Concrètement : ouvrir le `then:` du critère et le transcrire,
avant de lancer le test une première fois. Un test qui passe du premier coup sur
un comportement non encore implémenté n'est pas une bonne nouvelle — c'est le
signal qu'il faut vérifier ce qu'il affirme.

**Contrôle de rattrapage.** Le sabotage systématique (retirer la ligne testée,
vérifier le rouge) attrape ce cas : ici, retirer `slug` du `data` de l'update
rend 2 tests rouges. Il ne l'attrape que si le test dit la bonne chose — le
sabotage valide la sensibilité du test, pas la justesse de son assertion. Les
deux contrôles sont nécessaires, aucun ne remplace l'autre.

---

## 2026-08-06 — Une propriété affirmée dans un commentaire vaut zéro tant que rien ne l'observe

**Contexte.** Slice F7, première exécution de la suite de conformité RealWorld
officielle contre `apps/api` : **29 assertions en échec**. Aucune ne portait sur
un parcours métier — `articles`, `comments`, `favorites`, `feed`, `pagination`,
`profiles` et `tags` passaient intégralement du premier coup. Toutes portaient
sur la forme des erreurs.

**Le défaut.** `apps/api/src/domain/user/user.errors.ts` portait ce commentaire :
« les messages sont repris **verbatim** de l'implémentation de référence
RealWorld et des exemples d'`openapi.yml` ». Trois de ses cinq classes ne le
faisaient pas. Le contrat emploie `errors.credentials: ["invalid"]` là où nous
écrivions `errors["email or password"]: ["is invalid"]`, et `errors.token` là où
nous écrivions `errors.authorization`.

**Ce qui l'a laissé passer.** Rien n'était en position de le contredire. Les
exemples d'un fichier OpenAPI illustrent une *forme* ; la suite de conformité
*est* le contrat (PRD §15). Le commentaire a été écrit de bonne foi, il était
faux, et il a tenu lieu de vérification pendant deux slices — F2 et F3 — pendant
que la couverture AC affichait 100 %. Nos tests vérifiaient consciencieusement
que le code faisait ce que **nous** avions dit.

**Le motif général.** C'est celui que REQ-ARCH-001 avait déjà traité pour la
thèse du dépôt, sous une autre forme : la frontière typée était *affirmée* par
l'ADR 001 jusqu'à ce qu'un script la casse volontairement et constate que les
deux applications refusent de compiler. Même structure ici. **Une propriété
qu'aucun mécanisme ne peut démentir n'est pas une propriété, c'est une
intention.**

**Règle à appliquer.** Un commentaire qui affirme une conformité à une source
externe doit nommer **le fichier de cette source qui l'impose**, et ce fichier
doit être exécutable. `CONTRACT_MESSAGES` le fait : chaque message porte le
`.hurl` qui l'assert. Un commentaire qui dit « conforme à X » sans que X soit
rejouable est à traiter comme non vérifié.

**Corollaire sur les tests.** Le vrai signal était disponible et nous l'avons
manqué : une suite écrite **par un tiers** est le seul contrôle capable de
révéler un écart entre notre compréhension d'une spec et la spec. Aucune quantité
de tests maison ne le remplace — ils partagent tous le même malentendu.

---

## 2026-08-06 — Un nettoyage partiel produit un build vert et vide

**Contexte.** En vérifiant que `scripts/test-conformance.sh` tient sur une
machine froide (rule 02 : « reproduire la condition du runner »), j'ai supprimé
`apps/api/dist` et `packages/shared/dist` — mais pas les `*.tsbuildinfo`.

**Le symptôme.** `turbo run build --filter=@repo/api` a rapporté
`@repo/shared:build` en **succès**, puis 40 erreurs `TS2307: Cannot find module
'@repo/shared'`. Un graphe qui ordonne correctement, une tâche qui réussit, et un
artefact absent.

**La cause.** `packages/shared/tsconfig.json` porte `composite: true`, donc `tsc`
écrit `tsconfig.tsbuildinfo`. Avec le buildinfo présent et les sources
inchangées, `tsc` conclut que tout est à jour et **n'émet rien** — en sortant 0.
Le `dist/` supprimé n'est jamais reconstruit.

**Ce que ça n'est pas.** Ce n'est pas un trou du graphe turbo, et il ne fallait
pas le « corriger » : un runner de CI part d'un clone frais, où ni `dist/` ni le
buildinfo n'existent. La reproduction était fausse, pas le graphe. Rejouée
correctement (`pnpm clean`, qui supprime les deux), la suite passe.

**Règle à appliquer.** Pour simuler une machine froide, utiliser `pnpm clean`
— jamais un `rm -rf dist` à la main. Supprimer un artefact sans son index
d'incrémentalité crée un état que **ni le poste de développement ni la CI ne
connaissent**, et le diagnostic qu'on en tire porte sur un scénario qui n'existe
pas. Le temps s'y perd à chercher un trou de graphe imaginaire.

---

## 2026-08-06 — Un filtre par extension fait passer une omission pour une décision

**Contexte.** La suite e2e officielle (F7b) a un sous-dossier `helpers/`, là où la
suite Hurl est plate. Le contrôle de dérive, écrit en F7a pour la seule suite
Hurl, listait l'amont à plat et ne retenait que les `*.hurl`. Le généraliser aux
deux suites imposait de passer à l'arbre git récursif.

**Le symptôme, au premier run de la version récursive.** `DÉFAUT: la liste des
fichiers diverge de l'amont — manquant en local : run-hurl-tests.sh`. Sur la
suite API, celle qui était censée être sous contrôle depuis la veille.

**La cause.** Le dossier amont contient 14 fichiers, dont un lanceur shell. Nous
en avions vendoré 13 — le bon choix, et `UPSTREAM.md` l'explique. Mais ce choix
n'était **écrit nulle part dans le contrôle** : il tombait du glob `*.hurl`. La
conséquence est double, et la seconde moitié est la vraie.

1. L'omission avait l'apparence d'une décision sans en être une. Personne ne
   l'avait prise ; elle était un effet de bord.
2. Le même glob laissait **ajouter en local n'importe quel fichier d'une autre
   extension** sans que le contrôle le voie. Or ce contrôle existe pour une
   seule raison : rendre détectable la retouche de la suite officielle.

**Le corollaire, trouvé en tirant le fil.** `UPSTREAM.md` nommait ce lanceur
`run-api-tests-hurl.sh`. Le fichier amont s'appelle `run-hurl-tests.sh`. Une
affirmation fausse dans un document de provenance, écrite de mémoire, et qu'aucun
contrôle n'était en position de contredire — exactement le motif consigné le
2026-08-05 au sujet des messages « verbatim » de `user.errors.ts`.

**Règle à appliquer.** Une exclusion se **déclare**, elle ne se déduit pas d'un
filtre. Quand un contrôle compare un ensemble local à un ensemble amont, la
comparaison porte sur **tout** l'ensemble, et ce qu'on choisit d'en retirer est
une liste nommée, relue et annoncée à chaque exécution (`NOT_VENDORED` ici). Un
glob qui filtre est indiscernable d'un glob qui oublie — et il ne se relit pas,
puisqu'il n'a rien à dire.

**Piège voisin rencontré dans le même changement.** `sort(1)` suit la locale et
ignore la casse ; le `.sort()` de JavaScript compare des points de code.
Comparer deux listes triées par l'un et par l'autre a rapporté `SELECTORS.md`
simultanément « manquant en local » et « ajouté en local ». Un faux positif de
cette forme, répété, apprend à ne plus lire la sortie du contrôle — ce qui coûte
plus cher que l'absence de contrôle. Toute comparaison de listes entre deux
langages fixe sa collation (`LC_ALL=C`).

---

## 2026-08-06 — Une option de test n'a pas la portée qu'on lui prête, et le vert obtenu est un faux négatif

**Contexte.** Trois échecs e2e du lot #16, dont `comments.spec.ts:102` : « un
visiteur anonyme voit un lien de connexion et pas de formulaire ». Le défaut
attendu était le doublon de `a[href="/login"]` — la barre et l'invite en
portaient un chacun, et les assertions de locator Playwright sont strictes.

**Ce qui a été trouvé en tirant le fil.** Ce test crée son contexte lui-même
(`browser.newContext()`). Les options du bloc `use` de `playwright.config.ts` —
dont `ignoreHTTPSErrors` — sont appliquées par la fixture `_contextFactory` de
Playwright, donc **seulement** aux contextes que la configuration fabrique. Un
contexte créé par un test n'en hérite d'aucune.

**Pourquoi ça comptait ici, et pas avant.** Deux décisions récentes se
composaient. L'ADR 019 fait demander au navigateur un hôte d'API servi par un
terminateur TLS à certificat jetable ; l'ADR 020 fait charger la page article
depuis le navigateur. Sur ce contexte-là, tous les appels échouaient donc en
erreur de certificat, la page rendait sa coquille « indisponible », et il ne
restait qu'un seul `a[href="/login"]` — celui de la barre. **Le test serait passé
au vert parce que la page n'avait rien chargé.** Aucune des deux décisions n'est
en cause seule ; c'est leur composition qui a ouvert le trou, et rien ne l'a
signalé.

**Règle à appliquer.** Quand un correctif fait passer au vert un test qui
échouait, vérifier **ce que la page a effectivement rendu**, pas seulement le
verdict. Un faux négatif ne se distingue d'un vrai vert par aucun signal dans la
sortie de la suite : les deux affichent `passed`. La question à poser est « quel
état minimal de l'application suffirait à satisfaire cette assertion ? » — si la
réponse est « une page vide », l'assertion ne prouve rien.

**Corollaire sur la portée des options.** Une option de configuration de test se
lit avec sa **portée**, jamais seulement avec son nom. Ici, deux portées
distinctes existaient pour la même intention : le contexte (`use`) et le
navigateur (`launchOptions`). Seule la seconde survit à un contexte fabriqué par
un test, et c'est celle-là qu'il fallait. Le contrôle qui aurait attrapé ça plus
tôt est celui qu'on ne pense jamais à écrire : opposer le harnais à un cas où il
doit **échouer**, et constater qu'il échoue — exactement ce que
`verify-e2e-gate.sh` fait déjà pour un autre mode de panne.
## 2026-08-06 — Un rendu conditionnel sur un champ nullable supprime la preuve au lieu de la normaliser

**Contexte.** Le profil rendait sa bio par `{bio && <p>{bio}</p>}`. Une écriture
courante, qui se relit sans effort et qui paraît même prudente : ne rien afficher
plutôt qu'un paragraphe vide.

**Le symptôme.** Deux tests de la suite officielle intitulés « should not render
as literal null » échouaient. Ce titre décrit le défaut d'une **autre**
implémentation — afficher la chaîne `null` — et le nôtre était l'inverse exact :
aucun `null` à l'écran, mais **aucun paragraphe du tout**. Le contrat lit
`.user-info p` et attend `''` ; sans élément, le sélecteur n'aboutit pas, et
l'échec désigne la page entière au lieu du champ.

**La cause.** Les deux fautes viennent de la même omission : le champ traverse le
contrat sans que le rendu décide de ce que vaut son **absence**. Interpoler sans
normaliser écrit `null` à l'écran ; conditionner l'élément supprime le point
d'observation. `?? ''` ferme les deux, et c'est la règle que `lib/avatar.ts`
appliquait déjà à l'image — elle n'avait simplement jamais été étendue à la bio,
faute d'être écrite ailleurs que dans ce fichier.

**Règle à appliquer.** Un champ nullable se normalise **au rendu**, il ne se
masque pas : l'élément qui le porte reste présent et devient vide. Un lecteur
comme un test doivent pouvoir **constater** l'absence, pas la déduire de ce
qu'ils ne trouvent pas. Corollaire côté tests : asserter qu'un élément *contient*
la chaîne vide, jamais qu'il est absent — les deux assertions se ressemblent et
ne disent pas la même chose.

**Ce que ça dit du titre d'un test.** Un test de suite partagée nomme un
**symptôme**, pas une cause. Le lire comme un diagnostic aurait envoyé chercher
une interpolation fautive qui n'existait pas. C'est l'assertion qui fait foi,
jamais l'intitulé.
