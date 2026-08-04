#!/usr/bin/env bash
# Agrège les rapports de couverture des workspaces en un tableau Markdown.
#
# Pourquoi un script plutôt qu'un service : la couverture de ce dépôt est un
# **artefact local et de CI**, sans dépendance externe (ADR 006). Il faut donc
# une lecture des chiffres qui tienne dans un résumé de run GitHub et dans un
# terminal, sans compte à créer ni token à faire tourner.
#
# Source : les `coverage-summary.json` produits par le reporter `json-summary`
# de Vitest, un par workspace. Un workspace sans rapport est signalé comme tel
# plutôt qu'omis : une ligne absente se lit « pas de couverture », une ligne
# manquante ne se lit pas du tout.
#
# Usage : `pnpm coverage:summary` (après `pnpm test:coverage`).
# Item C1 du plan d'outillage (Phase R).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

WORKSPACES=("apps/api" "apps/web" "packages/shared")

if ! command -v jq > /dev/null 2>&1; then
  echo "ERREUR: jq introuvable — ce script lit les rapports JSON de Vitest avec jq."
  echo "        Installer jq : brew install jq (Mac) ou apt-get install jq (Debian/Ubuntu)."
  exit 1
fi

echo "| Workspace | Lignes | Branches | Fonctions | Instructions |"
echo "|---|---|---|---|---|"

missing=0
for workspace in "${WORKSPACES[@]}"; do
  report="$workspace/coverage/coverage-summary.json"
  if [ ! -f "$report" ]; then
    echo "| \`$workspace\` | _rapport absent_ | — | — | — |"
    missing=$((missing + 1))
    continue
  fi
  # Vitest écrit la chaîne "Unknown" quand aucun fichier n'entre dans le
  # périmètre de couverture (workspace encore sans code mesurable). L'afficher
  # tel quel donnerait « Unknown % », qu'on lit comme une panne de l'outil
  # plutôt que comme l'absence de surface à mesurer.
  jq -r --arg ws "$workspace" '
    def pct(v): if (v | type) == "number" then "\(v) %" else "_aucune surface_" end;
    .total as $t
    | "| `\($ws)` | \(pct($t.lines.pct)) | \(pct($t.branches.pct)) | \(pct($t.functions.pct)) | \(pct($t.statements.pct)) |"
  ' "$report"
done

if [ "$missing" -gt 0 ]; then
  echo ""
  echo "_$missing workspace(s) sans rapport : lancer \`pnpm test:coverage\`._"
fi
