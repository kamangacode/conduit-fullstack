# ADR 023 — Pagination : contrôles en formulaire GET, et taille de page choisie par le front

## Status

Accepted — 2026-08-07. Précise
[014](014-conformite-au-contrat-de-selecteurs-e2e.md) sur le markup de la
pagination, et applique la règle d'arbitrage posée par
[022](022-flux-demande-et-flux-resolu.md).

## Context

Deux écarts au contrat de conformité, indépendants, mais qui se manifestent
ensemble sur les mêmes tests.

**Le markup.** `apps/web/src/components/Pagination.tsx` rendait
`<li class="page-item"><a class="page-link" href=…>`. La suite vendorée vise
`.pagination button:has-text("2")` (six occurrences) et
`.pagination .page-item:has(button:has-text("2"))`
(`url-navigation.spec.ts:128,134`). Un `<a>` ne satisfait ni l'un ni l'autre.
`apps/web/conformance/e2e/SELECTORS.md` décrit d'ailleurs `.page-item` comme
*« Individual page **button** wrapper »* : la suite et le contrat s'accordent,
c'est notre markup qui diverge. Imbriquer un `<button>` dans le `<a>` est exclu —
contenu interactif imbriqué, HTML invalide.

**La taille de page.** `fetchFeed` n'envoyait pas `limit`, donc l'API appliquait
son défaut `DEFAULT_PAGE_LIMIT = 20`, et `pageCount`/`offsetForPage` calculaient
sur cette même valeur. Le contrat en attend **10** : la suite crée 15 articles et
affirme deux pages, 10 puis 5 (`url-navigation.spec.ts:252,266`), et
`navigation.spec.ts:160` crée 12 articles et exige au plus 10 aperçus. Avec 20,
il n'existe jamais de seconde page — donc **toutes** les assertions de
pagination tombent, y compris celles qui portent en apparence sur l'URL. Ce
défaut masquait le précédent : corriger le markup seul n'aurait rien fait passer.

REQ-WEB-010 posait par ailleurs comme règle que « la taille de page vient de
`@repo/shared` (`DEFAULT_PAGE_LIMIT`), pas d'une constante locale ». Cette règle
protégeait d'un désalignement entre le découpage du front et celui de l'API : il
faut décider ce qui la remplace, pas la contourner en silence.

## Options Considered

| Option | Trade-off |
|---|---|
| **A (retenue) — Un `<form method="get">` par contrôle, avec `<button name="page" value="N">`** | Le contrat obtient son `button`, la navigation reste une vraie navigation d'URL, et elle fonctionne sans JavaScript. Coûte un nœud `<form>` par cellule et un rechargement complet du document à chaque changement de page. |
| B — `<button>` piloté par `useRouter().push(...)` | Navigation cliente plus rapide, mais `Pagination` devient un composant à état de navigation, la pagination cesse de fonctionner sans JavaScript, et il n'y a plus aucune cible d'URL dans le DOM — plus d'ouverture dans un nouvel onglet, plus de lien explorable. |
| C — Garder le `<a>` et demander un amendement à l'amont | La suite est vendorée au SHA (ADR 018) : un amendement amont ne change rien à la copie, et l'attendre laisserait onze tests rouges pour une durée non bornée. |

| Option | Trade-off |
|---|---|
| **A (retenue) — `WEB_PAGE_LIMIT = 10` dans `apps/web/src/lib/pagination.ts`, envoyée en `limit`** | Le front décide et le dit. L'alignement est garanti par l'envoi, pas par le partage d'une constante. Coûte une seconde valeur de taille de page dans le dépôt. |
| B — Ramener `DEFAULT_PAGE_LIMIT` à 10 dans `packages/shared` | Une seule valeur, mais elle change le comportement par défaut de **l'API** pour tous ses appelants — y compris ceux qui ne demandent rien — pour satisfaire une attente du front. La règle R-10 fixe ce défaut ; le déplacer déborde largement du périmètre. |

## Decision

**Chaque contrôle de pagination est un formulaire GET.** `Pagination` rend, pour
chaque page :

```html
<li class="page-item"><form action="{pathname}" method="get">
  <!-- un input hidden par filtre courant, `page` exclu -->
  <button class="page-link" type="submit" name="page" value="N">N</button>
</form></li>
```

- Les filtres courants (`feed`, notamment) sont reportés en `<input type="hidden">`
  **avant** le bouton : l'ordre de soumission suit l'ordre du DOM, donc l'URL
  produite est `/?feed=following&page=2` — le filtre précède la page et n'est
  jamais perdu (REQ-WEB-010 AC-5, AC-12).
- Le bouton de la **première** page ne porte ni `name` ni `value` : un contrôle
  sans nom n'est pas soumis, donc la cible est `/` et non `/?page=1`. La règle
  d'URL canonique que portait `pageHref` survit au changement de mécanisme.
- `aria-current="page"` reste posé sur le contrôle de la page courante : la
  classe `active` marque la position pour l'œil et pour le contrat, elle ne dit
  rien à un lecteur d'écran.

L'écart au gabarit RealWorld (`a.page-link` → `form > button.page-link`) est
documenté en commentaire au-dessus du composant, comme la rule 11 l'exige.

**La taille de page du front est `WEB_PAGE_LIMIT = 10`**, déclarée dans
`apps/web/src/lib/pagination.ts`, utilisée par défaut par `pageCount` et
`offsetForPage`, et **envoyée** en `limit` par `fetchFeed` à chaque requête de
liste.

La règle de REQ-WEB-010 est réécrite en conséquence : ce qui garantit que le
front et l'API découpent pareil n'est pas de partager la constante, c'est que le
front **envoie** la sienne au lieu de laisser l'API choisir.
`DEFAULT_PAGE_LIMIT` reste ce que l'API applique quand personne ne demande rien.

## Consequences

### Positive

- Les onze tests de pagination du lot cessent de dépendre d'un total qui ne
  produisait jamais de seconde page.
- La navigation de pagination reste une navigation d'URL réelle : partageable,
  restaurée par le bouton précédent, et fonctionnelle sans JavaScript — ce qu'un
  `router.push` aurait perdu.
- Le couple « taille calculée / taille demandée » devient explicite et
  vérifiable : `fetchFeed` est testé sur le `limit` qu'il envoie.

### Negative

- Un changement de page recharge le document entier, là où un lien `next/link`
  ou un `router.push` aurait fait une navigation cliente. C'est plus lent, et
  c'est ce qui consomme le budget de 2 s des assertions de pagination.
- Plus de cible dans le DOM : on ne peut plus ouvrir la page 2 dans un nouvel
  onglet, ni copier son adresse depuis le contrôle. La perte est réelle et
  assumée ; elle serait réversible en un rendu si le contrat amont changeait.
- Un `<form>` par cellule alourdit le markup de la pagination par rapport au
  gabarit de référence.

### Neutral

- Les onglets du profil (`/profile/:username`, `/profile/:username/favorites`)
  héritent du nouveau contrôle par leur unique chemin (`FeedList` →
  `Pagination`). C'est une surface de non-régression à vérifier, pas une seconde
  implémentation à écrire.
- `pageHref` est remplacée par `pageFormTarget`, qui produit la même cible sous
  la forme qu'un formulaire GET sait soumettre (action, champs cachés, valeur du
  bouton). La logique d'URL canonique n'a pas changé de contenu, seulement de
  forme de sortie.
- Deux tailles de page coexistent dans le dépôt (20 côté API par défaut, 10
  demandée par le front). Ce n'est pas une duplication : ce sont deux rôles
  distincts, et le second est transmis explicitement au premier.
