#!/usr/bin/env bash
# Vérifie que la matrice de traçabilité relie réellement les critères aux tests.
#
# Le mode de panne d'un générateur de matrice est particulier : il ne plante
# pas, il produit un tableau. Une regex qui ne matche plus (guillemets changés,
# `test()` au lieu de `it()`, convention de nommage adaptée) et la matrice
# affiche « aucun test » partout — ou pire, « tout couvert » si le calcul
# s'inverse. Dans les deux cas le fichier existe, il est bien formé, et il ment.
#
# Ce script confronte donc le générateur à un référentiel de fixtures dont on
# connaît la réponse : une exigence à deux critères, dont un seul est couvert.
# On assert le contenu produit, pas seulement le code de retour.
#
# Lancé en pre-push (lefthook) et dans le job CI `Requirements`.
# Item E3 du plan d'outillage (Phase R). Convention : rule 20.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

GENERATOR="docs/requirements/_scripts/matrix.ts"
FIXTURES="$(mktemp -d -t conduit-matrix-fixtures-XXXXXX)"

TSX_BIN="$REPO_ROOT/node_modules/.bin/tsx"
if [ ! -x "$TSX_BIN" ]; then
  echo "ERREUR: binaire tsx introuvable. Lance 'pnpm install' depuis $REPO_ROOT."
  exit 1
fi

cleanup() {
  rm -rf "$FIXTURES"
}
trap cleanup EXIT INT TERM

failures=0
MATRIX="$FIXTURES/out/traceability-matrix.md"
ORPHANS="$FIXTURES/out/orphans.md"

# Référentiel connu : REQ-ARTICLE-001 (AC-1 couvert, AC-2 non couvert) et
# REQ-USER-001 (aucun test). Plus deux tests pathologiques : l'un rattaché à une
# exigence absente du référentiel, l'autre hors de tout describe d'exigence.
build_fixtures() {
  mkdir -p "$FIXTURES/requirements/functional/article" "$FIXTURES/requirements/functional/user"
  mkdir -p "$FIXTURES/requirements/functional/tag" "$FIXTURES/tests"
  cp docs/requirements/_template.md "$FIXTURES/requirements/_template.md"

  write_requirement "article" "REQ-ARTICLE-001" "Publier un article" "2"
  write_requirement "user" "REQ-USER-001" "S'inscrire" "1"
  write_requirement "tag" "REQ-TAG-001" "Lister les étiquettes" "1"

  cat > "$FIXTURES/tests/article.spec.ts" <<'EOF'
describe('REQ-ARTICLE-001 publier un article', () => {
  it('AC-1: dérive le slug du titre', () => {})
})

describe('REQ-GHOST-001 exigence absente du référentiel', () => {
  it('AC-1: ne devrait correspondre à rien', () => {})
})
EOF

  cat > "$FIXTURES/tests/errant.spec.ts" <<'EOF'
it('AC-1: critère revendiqué hors de tout describe d’exigence', () => {})
EOF

  # Troisième famille de preuves : une vérification écrite en Node, dont les
  # marqueurs sont des commentaires JS. Sans cette fixture, l'élargissement du
  # collecteur aux `.mjs` ne serait constaté par rien — et un jour où `patternsFor`
  # renverrait les motifs TypeScript pour un `.mjs`, la matrice cesserait en
  # silence de compter cette famille.
  cat > "$FIXTURES/tests/check-wiring.mjs" <<'EOF'
// describe REQ-TAG-001
// it AC-1: les étiquettes sont listées
process.exit(0)
EOF
}

write_requirement() {
  local domain="$1" id="$2" title="$3" criteria="$4"
  local path="$FIXTURES/requirements/functional/$domain/$id.md"
  {
    echo '---'
    echo "id: $id"
    echo "title: $title"
    echo 'type: functional'
    echo "domain: $domain"
    echo 'status: approved'
    echo 'priority: must'
    echo 'source: PRD §7'
    echo 'acceptance_criteria:'
    for index in $(seq 1 "$criteria"); do
      echo "  - id: AC-$index"
      echo "    given: un état initial $index"
      echo "    when: une action $index"
      echo "    then: un résultat vérifiable $index"
    done
    echo 'implementation:'
    echo '  files: []'
    echo '  tests: []'
    echo 'related:'
    echo '  issues: []'
    echo '  requirements: []'
    echo '  adrs: []'
    echo '---'
    echo ''
    echo "# $id — $title"
    echo ''
    echo '## Contexte'
    echo ''
    echo 'Fixture du script de vérification de la matrice.'
  } > "$path"
}

expect_in() {
  local label="$1" file="$2" pattern="$3"
  # `--` obligatoire : les motifs attendus commencent par « - » (puces Markdown),
  # que grep prendrait sinon pour des options — et l'assertion négative
  # passerait alors au vert sur une erreur de grep, pas sur une vraie absence.
  if grep -qF -- "$pattern" "$file"; then
    echo "ok [$label]"
    return
  fi
  echo "ECHEC [$label] : « $pattern » absent de $(basename "$file")."
  sed 's/^/         /' "$file"
  failures=$((failures + 1))
}

expect_not_in() {
  local label="$1" file="$2" pattern="$3"
  # `--` obligatoire : les motifs attendus commencent par « - » (puces Markdown),
  # que grep prendrait sinon pour des options — et l'assertion négative
  # passerait alors au vert sur une erreur de grep, pas sur une vraie absence.
  if grep -qF -- "$pattern" "$file"; then
    echo "ECHEC [$label] : « $pattern » présent dans $(basename "$file") alors qu'il ne devrait pas."
    failures=$((failures + 1))
    return
  fi
  echo "ok [$label]"
}

build_fixtures
"$TSX_BIN" "$GENERATOR" \
  --requirements "$FIXTURES/requirements" \
  --tests "$FIXTURES/tests" \
  --out "$FIXTURES/out" > /dev/null

# Un critère couvert cite le fichier ET la ligne : sans la ligne, la matrice
# indique qu'un test existe quelque part, ce qui ne se vérifie pas d'un clic.
expect_in "AC-1 couvert cite le test et sa ligne" "$MATRIX" "article.spec.ts:2"
expect_in "AC-2 apparaît dans la matrice" "$MATRIX" "| REQ-ARTICLE-001 | approved | AC-2 | — |"
expect_in "exigence sans aucun test listée" "$MATRIX" "| REQ-USER-001 | approved | AC-1 | — |"

# Une preuve écrite en Node compte comme une preuve, et se cite comme les autres :
# fichier ET ligne. Un collecteur qui aurait gardé l'extension `.sh` pour seule
# famille non-spec laisserait ce critère orphelin sans rien signaler.
expect_in "preuve .mjs citée avec sa ligne" "$MATRIX" "check-wiring.mjs:2"
expect_not_in "critère prouvé en .mjs absent des orphelins" "$ORPHANS" "- REQ-TAG-001 / AC-1"

# Le taux : 2 critères couverts sur 4 (AC-1 et AC-2 d'article, AC-1 de user,
# AC-1 de tag).
expect_in "taux de couverture calculé" "$MATRIX" "| Critères couverts par au moins un test | 2 (50 %) |"
expect_in "critères comptés" "$MATRIX" "| Critères d'acceptation | 4 |"
expect_in "exigences comptées" "$MATRIX" "| Exigences | 3 |"

expect_in "critère non couvert listé en orphelin" "$ORPHANS" "- REQ-ARTICLE-001 / AC-2"
expect_in "exigence sans test listée en orphelin" "$ORPHANS" "- REQ-USER-001"
expect_in "test rattaché à une exigence inconnue" "$ORPHANS" "REQ-GHOST-001"
expect_in "critère revendiqué hors describe" "$ORPHANS" "(hors describe)"

# Contrôle négatif : un critère réellement couvert ne doit PAS être signalé
# comme orphelin. Sans lui, un générateur qui listerait tout en orphelin
# passerait les assertions ci-dessus.
expect_not_in "AC-1 couvert absent des orphelins" "$ORPHANS" "- REQ-ARTICLE-001 / AC-1"

echo ""
if [ "$failures" -gt 0 ]; then
  echo "ERREUR: $failures assertion(s) en échec — la matrice de traçabilité ne dit pas la vérité."
  exit 1
fi
echo "ok: matrice de traçabilité vérifiée activement sur un référentiel de réponse connue."
exit 0
