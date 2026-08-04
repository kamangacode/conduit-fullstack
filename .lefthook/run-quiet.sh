#!/usr/bin/env bash
# Exécute une commande et tronque sa sortie en cas d'échec, pour garder les
# hooks lisibles (on ne veut voir les 800 lignes de log que si ça casse).
# Usage : bash .lefthook/run-quiet.sh 'CI=true pnpm lint'

set -o pipefail

MAX_LINES="${MAX_LINES:-20}"

output=$(eval "$*" 2>&1)
code=$?

if [ $code -ne 0 ]; then
  total=$(printf '%s\n' "$output" | wc -l)
  if [ "$total" -gt "$MAX_LINES" ]; then
    printf '%s\n' "$output" | tail -n "$MAX_LINES"
    printf '\n  ... %d lignes masquées — relance la commande pour la sortie complète\n' "$((total - MAX_LINES))"
  else
    printf '%s\n' "$output"
  fi
fi

exit $code
