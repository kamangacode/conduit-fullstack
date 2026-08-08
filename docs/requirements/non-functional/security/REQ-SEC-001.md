---
id: REQ-SEC-001
title: Refuser un commit qui ajoute un secret à haute confiance
type: non-functional
domain: security
status: implemented
priority: must
source: "plan outillage-craft item B2 (Cluster B — sécurité & secrets) ; rule 19 (sécurité by design : les secrets ne vivent jamais dans l'historique)"
acceptance_criteria:
  - id: AC-1
    given: "un diff indexé ajoutant une clé privée PEM, un JWT, une clé d'accès AWS, un jeton personnel GitHub ou une clé Stripe de production"
    when: "le garde-fou de secrets s'exécute"
    then: "il sort en erreur pour **chacune** des cinq familles, prise isolément"
  - id: AC-2
    given: "le même secret placé dans une spec, sous `docs/`, sous `.github/`, dans `lefthook.yml` ou sous `scripts/`"
    when: "le garde-fou s'exécute"
    then: "il laisse passer — ces emplacements portent des exemples synthétiques, jamais de configuration d'exécution"
  - id: AC-3
    given: "du code ordinaire, ou une clé Stripe en mode test"
    when: "le garde-fou s'exécute"
    then: "il laisse passer : un garde-fou qui refuse tout se fait contourner par `--no-verify` avant la fin de la semaine"
  - id: AC-4
    given: "un commit qui **retire** un secret déjà présent dans l'historique"
    when: "le garde-fou s'exécute"
    then: "il laisse passer — punir la correction découragerait le seul geste utile"
  - id: AC-5
    given: "un garde-fou volontairement neutralisé, soumis au même harnais que le garde-fou réel"
    when: "la vérification s'exécute"
    then: "elle le voit accepter un secret que le garde-fou réel refuse, ce qui prouve qu'elle conclut bien sur le code de sortie"
implementation:
  files:
    - scripts/secret-guard.sh
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-secret-guard.sh
related:
  issues: []
  requirements: []
  adrs: []
---

# REQ-SEC-001 — Refuser un commit qui ajoute un secret à haute confiance

## Contexte

Un secret committé n'est pas retiré par un commit qui l'efface : il reste dans l'historique, et sur un dépôt **public** il est indexé avant même qu'on s'en aperçoive. La seule parade qui vaille est de l'arrêter **avant** qu'il entre — d'où un hook de commit plutôt qu'un audit périodique.

## Choix retenus

**Haute confiance plutôt que détection large.** Les cinq motifs retenus ont une forme assez spécifique pour qu'une correspondance soit presque sûrement un vrai secret. La détection par entropie ou par mots-clés (`password=`, `token:`) produirait des faux positifs à chaque commit, et un garde-fou bruyant sur le chemin critique se neutralise tout seul : il suffit d'un `--no-verify` pris en habitude. La détection large a sa place, mais en CI et hors du chemin critique — c'est le rôle du scan d'historique prévu en B3.

**Lignes ajoutées seulement.** Un secret déjà présent dans l'historique n'est pas rattrapable par un hook de commit. Le signaler à chaque commit suivant transformerait le garde-fou en bruit permanent, jusqu'à sa désactivation. Sa révocation relève d'un autre outil.

**`sk_test_` volontairement absent.** Une clé Stripe de test n'est pas un secret. L'inclure ferait échouer des exemples légitimes et rangerait le garde-fou du côté du bruit.

**Logique extraite dans un script, pas en ligne dans le hook.** Un garde-fou qu'on ne peut pas exécuter hors de son hook ne peut pas être mis en échec, donc pas prouvé. Le dépôt a déjà payé cette leçon : en F2, des tests écrits d'après l'implémentation reproduisaient fidèlement l'oubli qu'ils devaient attraper, et la parade avait été d'extraire le comportement dans une fonction appelée par la production **et** par les specs. `lefthook.yml` et `scripts/verify-secret-guard.sh` appellent donc le même `scripts/secret-guard.sh` — jamais une copie de ses motifs.

## Couverture

AC-1 à AC-5 sont prouvés par `scripts/verify-secret-guard.sh`, qui oppose le script réel à un dépôt git jetable dont il pilote l'index — jamais celui du développeur qui lance la vérification.

La vérification a été éprouvée par sabotage : en neutralisant le seul motif AWS dans `secret-guard.sh`, elle passe au rouge sur ce cas **et sur lui seul**, les douze autres restant verts. Une vérification qui resterait verte sous sabotage ne prouverait rien de ce qu'elle affirme.

AC-5 est le contrôle du contrôle : sans lui, un harnais qui rendrait toujours « accepté » — chemin mal construit, `bash` introuvable, `cd` en échec — afficherait `ok` partout et la vérification entière deviendrait un no-op vert. Le dépôt a déjà attrapé un faux `ok` de ce genre sur un `grep` (item E3).

## Limites assumées

Les emplacements exclus (specs, `docs/`, `.github/`, `lefthook.yml`, `scripts/`) sont la surface d'évasion du garde-fou : un vrai secret y passerait. Le compromis tient parce qu'aucun de ces emplacements n'est lu au démarrage par `apps/api` ou `apps/web` — ils ne portent pas de configuration d'exécution. Étendre cette liste à un dossier qui en porterait viderait l'exigence de sa substance.
