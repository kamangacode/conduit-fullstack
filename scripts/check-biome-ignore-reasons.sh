#!/usr/bin/env bash
# Vérifie que chaque `biome-ignore lint/complexity/noExcessiveCognitiveComplexity`
# AJOUTÉ dans le diff (vs base ref) porte une raison sérieuse.
#
# Un biome-ignore sans justification est une dette invisible : il éteint le
# verrou de complexité sans laisser de trace du pourquoi. Cette convention rend
# l'exception coûteuse à écrire, donc rare et assumée :
#   - raison non-vide, au moins 30 caractères après "noExcessiveCognitiveComplexity:"
#   - raison SANS mot d'excuse paresseuse (case-insensitive) :
#     TODO, TBD, FIXME, XXX, "fix later", "to refactor", legacy
#
# Exit 0 si toutes les annotations ajoutées sont conformes (ou aucune ajoutée).
# Exit 1 sinon, avec un message par site fautif.
#
# Lancé en CI sur les PR (avec accès au base ref). Item A3 du plan d'outillage.

set -euo pipefail

BASE_REF="${1:-origin/staging}"

# Lignes AJOUTÉES (préfixe '+', hors en-tête '+++') portant l'annotation.
# [+] (classe de caractères) plutôt que \+ pour la portabilité BSD/GNU grep.
ADDED_LINES=$(
  git diff "${BASE_REF}...HEAD" -- '*.ts' '*.tsx' 2>/dev/null \
    | grep -E '^[+]' \
    | grep -vE '^[+][+][+]' \
    | grep -F 'biome-ignore lint/complexity/noExcessiveCognitiveComplexity' \
    || true
)

if [ -z "$ADDED_LINES" ]; then
  echo "ok: aucune annotation biome-ignore noExcessiveCognitiveComplexity ajoutée dans ce diff."
  exit 0
fi

# Blocklist avec word boundaries : un identifiant comme "executeLegacy" reste OK ;
# seul "legacy" comme mot autonome est interdit.
BLOCKLIST_RE='\b(TODO|TBD|FIXME|XXX|fix[[:space:]]+later|to[[:space:]]+refactor|legacy)\b'
INVALID_COUNT=0

while IFS= read -r line; do
  # Extraire la raison : tout ce qui suit "noExcessiveCognitiveComplexity:".
  reason=$(printf '%s\n' "$line" | sed -E 's/.*noExcessiveCognitiveComplexity:[[:space:]]*//')
  reason_trimmed=$(printf '%s' "$reason" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')

  problem=""

  if [ -z "$reason_trimmed" ]; then
    problem="raison vide"
  elif [ "${#reason_trimmed}" -lt 30 ]; then
    problem="raison trop courte (< 30 caractères) : '$reason_trimmed'"
  fi

  if [ -z "$problem" ] && printf '%s' "$reason_trimmed" | grep -iqE "$BLOCKLIST_RE"; then
    matched=$(printf '%s' "$reason_trimmed" | grep -ioE "$BLOCKLIST_RE" | head -1)
    problem="raison contient le mot blocklist '$matched' : '$reason_trimmed'"
  fi

  if [ -n "$problem" ]; then
    echo "ERROR: $problem"
    echo "       ligne du diff : $line"
    echo ""
    INVALID_COUNT=$((INVALID_COUNT + 1))
  fi
done <<< "$ADDED_LINES"

if [ "$INVALID_COUNT" -gt 0 ]; then
  echo "ERROR: $INVALID_COUNT annotation(s) biome-ignore non-conforme(s) à la convention <reason>."
  echo "       Une exception de complexité doit expliquer POURQUOI l'invariant tient malgré le seuil."
  exit 1
fi

ADDED_COUNT=$(printf '%s\n' "$ADDED_LINES" | grep -c .)
echo "ok: $ADDED_COUNT annotation(s) biome-ignore noExcessiveCognitiveComplexity conforme(s)."
exit 0
