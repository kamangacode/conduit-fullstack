# Traçabilité éditoriale — 1 outil = 1 fichier = 1 article

`conduit-fullstack` est le pivot de la roadmap éditoriale outillage-craft (RC — Référentiel Craft). Chaque garde-fou technique du repo est aussi, potentiellement, la matière d'un article de blog public qui pointe dessus.

## Principe

> **1 outil = 1 fichier réel dans le repo = 1 article de blog.**

Concrètement : quand une config, un hook ou un garde-fou est ajouté (Biome, Lefthook, validation d'env via Zod, idempotency d'un endpoint, tests de contrat sur `packages/shared`, workflow CI, etc.), il doit exister comme un **vrai fichier crédible et bien commenté** dans le repo — pas un extrait isolé recopié dans un article. L'article public renvoie vers ce fichier via un lien GitHub stable, avec éventuellement un court snippet.

## Conséquences pratiques

- **Le fichier prime sur l'article.** Un fichier de config mal écrit ou non fonctionnel invalide l'article qui le cite — le repo doit rester correct en continu, pas seulement au moment de la rédaction.
- **Commentaires soignés.** Un fichier qui sera montré publiquement (config, script, garde-fou) mérite des commentaires qui expliquent le *pourquoi*, pas seulement le *quoi* : un lecteur externe doit pouvoir comprendre la décision sans contexte additionnel.
- **Chemins stables.** Un article pointe vers un fichier via un lien GitHub à un chemin précis. Ne pas déplacer ou renommer un fichier référencé par un article sans mettre à jour l'article en conséquence (ou laisser une redirection/alias si le déplacement est inévitable).
- **Zéro trace IA.** Ce repo est public et sert de preuve de craft humain — voir la règle d'attribution dans `03-commits-review.md`. Aucun fichier, commit, PR ou doc ne doit mentionner un assistant IA. Un fichier destiné à être cité dans un article est d'autant plus exposé : vérifier avant de committer.

## CTA produit

Le call-to-action produit (mentoring, offre, etc.) est géré **côté blog**, jamais dans ce repo. `conduit-fullstack` reste un artefact technique pur — vitrine de code, pas support marketing.
