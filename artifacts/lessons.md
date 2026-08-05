# Leçons — conduit-fullstack

> Registre post-incident (rules 01 et 21). Une entrée par défaut qui a échappé à
> la revue, avec assez de contexte pour ne pas se reproduire à l'identique.
>
> Trois registres, trois usages : un **choix** va en ADR, un **fait de contexte**
> dans la mémoire de session, un **échec évité** ici.

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
