#!/usr/bin/env bash
# Vérifie que le validateur d'exigences rejette réellement ce qu'il prétend rejeter.
#
# Un validateur est un garde-fou comme un autre : tant que rien ne l'a mis en
# échec, on ne sait pas s'il valide ou s'il acquiesce. Le mode de panne redouté
# n'est pas « il refuse un REQ correct » (visible immédiatement) mais « il
# accepte tout » — un schéma mal branché, un `safeParse` dont on ignore le
# résultat, et le référentiel se remplit de REQ non conformes sans un bruit.
#
# Ce script construit donc un référentiel de fixtures jetable et confronte le
# validateur à un cas par mode de défaillance connu, plus un **contrôle positif**
# (un référentiel valide doit passer) — sans lui, un validateur qui échouerait
# toujours passerait ce test avec les honneurs.
#
# Lancé en pre-push (lefthook) et dans le job CI `Requirements`.
# Item E2 du plan d'outillage (Phase R). Convention : rule 20.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VALIDATOR="docs/requirements/_scripts/validate.ts"
TEMPLATE="docs/requirements/_template.md"

# Binaire résolu une fois : le script enchaîne une douzaine d'exécutions, et
# passer par `pnpm exec` à chaque fois doublerait le temps du hook pre-push.
TSX_BIN="$REPO_ROOT/node_modules/.bin/tsx"
if [ ! -x "$TSX_BIN" ]; then
  echo "ERREUR: binaire tsx introuvable. Lance 'pnpm install' depuis $REPO_ROOT."
  exit 1
fi

FIXTURES="$(mktemp -d -t conduit-requirements-fixtures-XXXXXX)"

cleanup() {
  rm -rf "$FIXTURES"
}
trap cleanup EXIT INT TERM

failures=0
# Compté à l'exécution plutôt qu'écrit en dur : un total figé dans le message
# final se désynchronise au premier cas ajouté.
failure_modes=0

# Repart d'un référentiel de fixtures neuf : gabarit réel (il doit rester valide
# dans les fixtures aussi) et un REQ conforme, que chaque cas vient dégrader.
reset_fixtures() {
  rm -rf "${FIXTURES:?}/requirements"
  mkdir -p "$FIXTURES/requirements/functional/article"
  cp "$TEMPLATE" "$FIXTURES/requirements/_template.md"
  cat > "$FIXTURES/requirements/functional/article/REQ-ARTICLE-001.md" <<'EOF'
---
id: REQ-ARTICLE-001
title: Publier un article
type: functional
domain: article
status: approved
priority: must
source: PRD §7.3
acceptance_criteria:
  - id: AC-1
    given: un utilisateur authentifié
    when: il soumet un article valide
    then: l'article est créé et son slug est dérivé du titre
implementation:
  files: []
  tests: []
related:
  issues: []
  requirements: []
  adrs: []
---

# REQ-ARTICLE-001 — Publier un article

## Contexte

Fixture du script de vérification du validateur.
EOF
}

# Une seule exécution par cas : sortie et code de retour capturés ensemble.
# (Deux exécutions doubleraient le coût du hook pre-push pour rien.)
last_output=""
last_code=0

run_validator() {
  set +e
  last_output="$("$TSX_BIN" "$VALIDATOR" "$FIXTURES/requirements" 2>&1)"
  last_code=$?
  set -e
}

# Attend un REJET portant un motif précis : un rejet pour la mauvaise raison
# masquerait un trou de couverture du validateur.
expect_reject() {
  local label="$1" pattern="$2"
  failure_modes=$((failure_modes + 1))
  run_validator

  if [ "$last_code" -eq 0 ]; then
    echo "ECHEC [$label] : le validateur a accepté un référentiel non conforme."
    failures=$((failures + 1))
    return
  fi
  if ! printf '%s\n' "$last_output" | grep -qF "$pattern"; then
    echo "ECHEC [$label] : rejet obtenu, mais sans le motif attendu « $pattern »."
    printf '%s\n' "$last_output" | sed 's/^/         /'
    failures=$((failures + 1))
    return
  fi
  echo "ok [$label] : rejeté sur « $pattern »."
}

expect_accept() {
  local label="$1"
  run_validator
  if [ "$last_code" -ne 0 ]; then
    echo "ECHEC [$label] : un référentiel conforme a été rejeté."
    printf '%s\n' "$last_output" | sed 's/^/         /'
    failures=$((failures + 1))
    return
  fi
  echo "ok [$label] : accepté."
}

REQ="$FIXTURES/requirements/functional/article/REQ-ARTICLE-001.md"

# --- Contrôle positif --------------------------------------------------------
reset_fixtures
expect_accept "contrôle positif : gabarit + REQ conforme"

# --- Forme du frontmatter ----------------------------------------------------
reset_fixtures
printf '%s\n' '---' 'pas de frontmatter fermé' > "$REQ"
expect_reject "frontmatter non terminé" "frontmatter YAML absent"

reset_fixtures
sed -i.bak 's/^priority: must$/priority: must\nprioritee: must/' "$REQ" && rm -f "$REQ.bak"
expect_reject "clé inconnue (faute de frappe)" "prioritee"

reset_fixtures
sed -i.bak 's/^status: approved$/status: valide/' "$REQ" && rm -f "$REQ.bak"
# Motif « status — » : c'est le chemin de la clé fautive tel que le validateur
# le rapporte, pas le libellé Zod, qui peut changer à la montée de version.
expect_reject "statut hors énumération" "status —"

reset_fixtures
sed -i.bak 's/^  - id: AC-1$/  - id: AC-2/' "$REQ" && rm -f "$REQ.bak"
expect_reject "numérotation d'AC non séquentielle" "séquentielle"

reset_fixtures
sed -i.bak 's/^    then: .*$/    then: ""/' "$REQ" && rm -f "$REQ.bak"
expect_reject "critère sans « then »" "then"

# --- Engagement du statut `implemented` --------------------------------------
reset_fixtures
sed -i.bak 's/^status: approved$/status: implemented/' "$REQ" && rm -f "$REQ.bak"
expect_reject "implemented sans trace d'implémentation" "au moins un fichier"

# --- Intégrité (contrôles qui regardent le disque) ---------------------------
reset_fixtures
sed -i.bak 's|^  files: \[\]$|  files: ["apps/api/src/fichier-inexistant.ts"]|' "$REQ" && rm -f "$REQ.bak"
expect_reject "référence vers un fichier inexistant" "référence morte"

reset_fixtures
sed -i.bak 's/^domain: article$/domain: comment/' "$REQ" && rm -f "$REQ.bak"
expect_reject "domaine incohérent avec le chemin" "emplacement incohérent"

reset_fixtures
cp "$REQ" "$FIXTURES/requirements/functional/article/REQ-ARTICLE-002.md"
expect_reject "identifiant dupliqué" "déjà porté par"

reset_fixtures
sed -i.bak 's/^  adrs: \[\]$/  adrs: ["999"]/' "$REQ" && rm -f "$REQ.bak"
expect_reject "ADR référencé inexistant" "aucun ADR"

reset_fixtures
sed -i.bak 's/^  requirements: \[\]$/  requirements: ["REQ-USER-042"]/' "$REQ" && rm -f "$REQ.bak"
expect_reject "REQ référencé inexistant" "ne correspond à aucun REQ"

reset_fixtures
printf '%s\n' '# Notes de travail' > "$FIXTURES/requirements/functional/article/notes.md"
expect_reject "fichier égaré dans un dossier de domaine" "frontmatter YAML absent"

reset_fixtures
printf '%s\n' '# Documentation du domaine' > "$FIXTURES/requirements/functional/article/README.md"
expect_accept "README.md de documentation toléré dans un dossier de domaine"

# --- Le gabarit lui-même -----------------------------------------------------
reset_fixtures
rm -f "$FIXTURES/requirements/_template.md"
expect_reject "gabarit absent" "gabarit introuvable"

# --- Verdict -----------------------------------------------------------------
echo ""
if [ "$failures" -gt 0 ]; then
  echo "ERREUR: $failures cas non couvert(s) — le validateur d'exigences ne garde pas ce qu'il annonce."
  exit 1
fi
echo "ok: validateur d'exigences vérifié activement (contrôle positif + $failure_modes modes de défaillance)."
exit 0
