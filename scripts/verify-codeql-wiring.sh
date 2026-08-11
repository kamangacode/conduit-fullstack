#!/usr/bin/env bash
# Met `scripts/check-codeql-wiring.mjs` en échec, propriété par propriété
# (REQ-SEC-005).
#
# Un workflow CodeQL mal câblé **réussit** : job vert, durée plausible, et rien
# ne distingue une analyse publiée d'une analyse perdue. Le contrôle de câblage
# existe pour ça — mais un contrôle de câblage a exactement le même défaut, à un
# étage de plus. S'il n'assertait rien (chemin fautif, YAML parsé en objet vide,
# boucle sur une liste vide), il afficherait « ok » et certifierait un workflow
# qu'il n'a jamais regardé.
#
# La seule preuve est donc de **saboter le workflow, une propriété à la fois**,
# et d'exiger un refus à chaque fois. Cinq sabotages, cinq refus attendus : sans
# eux, on ne saurait pas si le contrôle vérifie cinq choses ou aucune.
#
# Les variantes sont produites en modifiant l'AST YAML du **vrai** fichier, pas
# en écrivant cinq workflows fictifs : une fixture écrite à la main diverge du
# fichier réel dès la première évolution, et le harnais se mettrait alors à
# prouver des choses sur un fichier que le dépôt n'utilise plus.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`.
#
# describe REQ-SEC-005 — l'analyse statique publie, sur les deux langages

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECKER="$REPO_ROOT/scripts/check-codeql-wiring.mjs"
WORKFLOW="$REPO_ROOT/.github/workflows/codeql.yml"
SANDBOX="$(mktemp -d -t verify-codeql-XXXXXX)"
FAILURES=0

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -f "$CHECKER" ]  || { echo "ECHEC : $CHECKER introuvable" >&2; exit 1; }
[ -f "$WORKFLOW" ] || { echo "ECHEC : $WORKFLOW introuvable" >&2; exit 1; }

# Produit une variante du workflow réel, amputée d'une propriété. Le sabotage
# porte sur l'arbre YAML : retirer une clé, pas une ligne — un `sed` sur le texte
# toucherait aussi les commentaires, qui parlent abondamment de ces mêmes clés.
sabotage() {
  local kind="$1" out="$2"
  SABOTAGE_KIND="$kind" SABOTAGE_OUT="$out" SABOTAGE_SRC="$WORKFLOW" node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs"
    import { parse, stringify } from "yaml"
    const doc = parse(readFileSync(process.env.SABOTAGE_SRC, "utf8"))
    const job = doc.jobs.analyze
    switch (process.env.SABOTAGE_KIND) {
      case "no-permission":   delete job.permissions["security-events"]; break
      case "no-actions-lang": job.strategy.matrix.language =
                                job.strategy.matrix.language.filter((l) => l !== "actions"); break
      case "no-pull-request": delete doc.on.pull_request; break
      case "autobuild":       for (const s of job.steps)
                                if (String(s.uses ?? "").includes("codeql-action/init"))
                                  s.with["build-mode"] = "autobuild"
                              break
      case "no-analyze":      job.steps = job.steps.filter(
                                (s) => !String(s.uses ?? "").includes("codeql-action/analyze")); break
      default: throw new Error("sabotage inconnu : " + process.env.SABOTAGE_KIND)
    }
    writeFileSync(process.env.SABOTAGE_OUT, stringify(doc))
  '
}

run_checker_on() {
  local target="$1" checker="${2:-$CHECKER}"
  local status=0
  node "$checker" "$target" >/dev/null 2>&1 || status=$?
  return "$status"
}

expect_refuse() {
  local label="$1" kind="$2"
  local variant="$SANDBOX/$kind.yml"
  sabotage "$kind" "$variant"
  if run_checker_on "$variant"; then
    echo "  ECHEC : $label — le contrôle a accepté un câblage amputé"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ok : $label — refusé"
  fi
}

# it AC-1: le câblage réel est conforme
#
# Contrôle positif, et il vient en premier : un contrôle qui refuserait tout
# satisferait les cinq sabotages ci-dessous sans rien garantir du fichier réel.
echo "phase 1 — le workflow réel doit passer"
if run_checker_on "$WORKFLOW"; then
  echo "  ok : câblage réel — accepté"
else
  echo "  ECHEC : le contrôle refuse le workflow réel"
  FAILURES=$((FAILURES + 1))
fi

# it AC-2: sans `security-events: write`, le contrôle refuse
#
# La panne la plus silencieuse du dispositif : l'analyse tourne, réussit, et
# n'uploade rien. L'onglet Security reste vide sans qu'aucun job ne rougisse.
echo "phase 2 — la permission dont l'absence ne se voit nulle part"
expect_refuse "security-events retiré" "no-permission"

# it AC-3: sans le langage `actions`, le contrôle refuse
#
# C'est le langage qui a motivé l'activation : il couvre `.github/workflows/`,
# donc la surface `pull_request_target` de ce dépôt. Le retirer laisserait un
# SAST d'apparence normale, aveugle à la partie la plus risquée.
echo "phase 3 — le langage qui couvre les workflows eux-mêmes"
expect_refuse "langage actions retiré" "no-actions-lang"

# it AC-4: sans le déclencheur `pull_request`, le contrôle refuse
echo "phase 4 — l'analyse doit voir un changement avant son merge"
expect_refuse "déclencheur pull_request retiré" "no-pull-request"

# it AC-5: sans `build-mode: none`, le contrôle refuse
echo "phase 5 — pas d'autobuild : ces langages s'analysent sans compilation"
expect_refuse "build-mode passé à autobuild" "autobuild"

# it AC-6: sans étape `analyze`, le contrôle refuse
#
# Le cas dégénéré : un workflow qui initialise CodeQL sans jamais publier. Il
# consomme des minutes de runner et reste vert.
echo "phase 6 — un workflow qui n'analyse pas ne prouve rien"
expect_refuse "étape analyze retirée" "no-analyze"

# it AC-7: la vérification sait elle-même échouer
#
# Contrôle de contrôle. Sans lui, un `run_checker_on` qui rendrait toujours 1 —
# chemin fautif, `node` introuvable — afficherait « ok » sur les cinq sabotages
# et certifierait un contrôle absent.
echo "phase 7 — contrôle négatif : un contrôleur neutralisé doit être détecté"
NEUTERED="$SANDBOX/neutered-checker.mjs"
printf 'process.exit(0)\n' > "$NEUTERED"
sabotage "no-permission" "$SANDBOX/for-neutered.yml"
if run_checker_on "$SANDBOX/for-neutered.yml" "$NEUTERED"; then
  echo "  ok : le harnais voit bien accepter le contrôleur neutralisé sur un câblage que le vrai refuse"
else
  echo "  ECHEC : le harnais ne distingue pas un contrôleur neutralisé d'un contrôleur actif"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le contrôle de câblage CodeQL ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: chaque propriété du câblage CodeQL a été retirée, et le contrôle l'a vue manquer."
