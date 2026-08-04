#!/usr/bin/env bash
# Vérifie que le verrou hard-fail Biome est réellement actif sur la règle
# `noExcessiveCognitiveComplexity` au scope racine.
#
# Un `biome.json` peut *déclarer* une règle en "error" sans qu'elle bloque
# quoi que ce soit si un override l'éclipse. Ce script ne fait pas confiance à
# la déclaration : il la teste. Il crée un fichier synthétique dont la
# complexité cognitive dépasse le seuil, lance `biome lint --reporter=json` et
# assert la sévérité réelle du diagnostic. C'est de la vérification active, pas
# de la lecture de config.
#
# 3 phases :
#   1. Code de production : synthétique en apps/api/src/ → sévérité attendue "error"
#   2. Chemin override    : synthétique en *.spec.ts       → sévérité attendue "info"
#   3. No-regression      : après cleanup, lint sur le chemin supprimé ne crashe pas
#
# Pourquoi --reporter=json plutôt que l'exit code de Biome ? Parce que d'autres
# règles ("error" ailleurs) peuvent faire sortir Biome en non-zéro pour des
# raisons sans rapport. La vérité est dans le champ .severity du diagnostic
# spécifique au fichier.
#
# Le fichier synthétique porte un nom camelCase pour ne pas déclencher
# useFilenamingConvention. Il est supprimé immédiatement via un trap EXIT.
#
# Lancé localement avant push (lefthook pre-push, Phase 2) et en CI dans le job
# lint (Phase 2). Item A2 du plan d'outillage.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNTH_REL="apps/api/src/verifyBiomeHardfailSynthetic.ts"
SYNTH_ABS="$REPO_ROOT/$SYNTH_REL"
SYNTH_SPEC_REL="apps/api/src/verifyBiomeHardfailSynthetic.spec.ts"
SYNTH_SPEC_ABS="$REPO_ROOT/$SYNTH_SPEC_REL"
STDERR_LOG="$(mktemp -t biome-hardfail-stderr-XXXXXX.log)"

# Biome est une dépendance de la RACINE du monorepo (config unique). On résout le
# binaire via pnpm, avec repli sur node_modules/.bin (chemin des deps directes).
BIOME_BIN="$(cd "$REPO_ROOT" && pnpm exec which biome 2>/dev/null | tail -1)"
if [ -z "$BIOME_BIN" ] || [ ! -x "$BIOME_BIN" ]; then
  BIOME_BIN="$REPO_ROOT/node_modules/.bin/biome"
fi

if [ ! -x "$BIOME_BIN" ]; then
  echo "ERROR: binaire biome introuvable."
  echo "       Lance 'pnpm install' depuis $REPO_ROOT puis relance ce script."
  exit 1
fi

if ! command -v jq > /dev/null 2>&1; then
  echo "ERROR: jq introuvable. Le script parse la sortie JSON de Biome avec jq."
  echo "       Installer jq : brew install jq (Mac) ou apt-get install jq (Debian/Ubuntu)."
  exit 1
fi

cleanup() {
  rm -f "$SYNTH_ABS" "$SYNTH_SPEC_ABS" "$STDERR_LOG"
}
trap cleanup EXIT INT TERM

# Écrit un fichier dont la complexité cognitive dépasse 15 (boucles imbriquées +
# branches). Si Biome ne remonte plus de diagnostic (algorithme changé lors d'un
# upgrade majeur), re-vérifier avec : "$BIOME_BIN" lint --reporter=json "$SYNTH_ABS"
write_synth_to() {
  local target="$1"
  cat > "$target" <<'EOF'
// Fichier synthétique créé par scripts/verify-biome-hardfail.sh.
// Complexité cognitive volontairement > 15 pour valider que le verrou
// noExcessiveCognitiveComplexity est actif. Supprimé immédiatement après
// exécution. NE PAS COMMITTER.
export function syntheticVerifyHardFail(items: number[]): number {
  let result = 0
  for (const a of items) {
    for (const b of items) {
      if (a > b) {
        if (a + b > 10) {
          result += a * b
        } else {
          result -= a + b
        }
      } else if (a < b) {
        if (a * b > 100) {
          result *= 2
        }
      }
    }
  }
  if (result < 0) {
    return 0
  }
  return result
}
EOF
}

# Lance biome lint --reporter=json sur la cible et retourne la sévérité du
# diagnostic noExcessiveCognitiveComplexity (ou "absent").
run_biome_and_get_severity() {
  local target="$1"
  local json
  local biome_exit

  set +e
  json=$("$BIOME_BIN" lint --reporter=json "$target" 2>"$STDERR_LOG")
  biome_exit=$?
  set -e

  if [ -z "$json" ]; then
    echo "ERROR: biome lint n'a produit aucune sortie JSON sur $target (exit=$biome_exit)."
    echo "       stderr:"
    sed 's/^/         /' "$STDERR_LOG" >&2
    return 2
  fi

  echo "$json" | jq -r '
    [.diagnostics[]
     | select(.category=="lint/complexity/noExcessiveCognitiveComplexity")
     | .severity]
    | first // "absent"'
}

# Phase 1 : code de production → sévérité attendue "error".
write_synth_to "$SYNTH_ABS"
SEVERITY="$(run_biome_and_get_severity "$SYNTH_ABS")"

case "$SEVERITY" in
  error)
    echo "ok phase 1 (production): verrou hard-fail actif (sévérité \"error\")."
    ;;
  warning)
    echo "ERROR: noExcessiveCognitiveComplexity est en \"warn\", pas \"error\"."
    echo "       Le verrou n'est PAS actif : un warning n'empêche pas le merge."
    echo "       Attendu : \"error\" au scope racine (linter.rules.complexity) dans biome.json."
    exit 1
    ;;
  info)
    echo "ERROR: noExcessiveCognitiveComplexity est en \"info\" sur le code de production."
    echo "       Un override a probablement envahi le scope production. Vérifie biome.json."
    exit 1
    ;;
  absent)
    echo "ERROR: aucun diagnostic noExcessiveCognitiveComplexity sur le synthétique ($SYNTH_REL)."
    echo "       Causes possibles : règle en \"off\", ou seuil de complexité non atteint"
    echo "       (algorithme Biome modifié lors d'un upgrade)."
    echo "       Vérifie : \"$BIOME_BIN\" lint --reporter=json \"$SYNTH_ABS\""
    exit 1
    ;;
  *)
    echo "ERROR: sévérité imprévue \"$SEVERITY\" (attendu : error | warning | info | absent)."
    exit 1
    ;;
esac

# Phase 2 : chemin override (*.spec.ts) → sévérité attendue "info".
# Garantit que l'override tests/scripts/seeds reste actif et n'éclipse pas
# accidentellement le scope production (et inversement).
write_synth_to "$SYNTH_SPEC_ABS"
SEVERITY_SPEC="$(run_biome_and_get_severity "$SYNTH_SPEC_ABS")"

case "$SEVERITY_SPEC" in
  info)
    echo "ok phase 2 (override .spec.ts): sévérité \"info\" (override tests actif)."
    ;;
  error)
    echo "ERROR: l'override tests est rompu — sévérité \"error\" sur $SYNTH_SPEC_REL."
    echo "       Les fichiers de test devraient rester en \"info\". Vérifie biome.json overrides[*]."
    exit 1
    ;;
  *)
    echo "ERROR: sévérité inattendue \"$SEVERITY_SPEC\" sur l'override .spec.ts (attendu : info)."
    exit 1
    ;;
esac

# Phase 3 : cleanup explicite + no-regression.
rm -f "$SYNTH_ABS" "$SYNTH_SPEC_ABS"
if [ -e "$SYNTH_ABS" ] || [ -e "$SYNTH_SPEC_ABS" ]; then
  echo "ERROR: cleanup explicite échoué (fichier synthétique persiste)."
  exit 1
fi
echo "ok phase 3 (cleanup): fichiers synthétiques supprimés."

echo "ok: verrou biome hard-fail noExcessiveCognitiveComplexity actif et override préservé."
exit 0
