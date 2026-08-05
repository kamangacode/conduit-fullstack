# Leçons — conduit-fullstack

> Registre post-incident (rules 01 et 21). Une entrée par défaut qui a échappé à
> la revue, avec assez de contexte pour ne pas se reproduire à l'identique.
>
> Trois registres, trois usages : un **choix** va en ADR, un **fait de contexte**
> dans la mémoire de session, un **échec évité** ici.

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
