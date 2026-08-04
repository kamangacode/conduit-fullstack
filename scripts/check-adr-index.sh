#!/usr/bin/env bash
# Vérifie que le dossier `docs/adr/` respecte sa propre convention.
#
# Un référentiel d'ADR se dégrade toujours de la même façon : deux personnes
# créent le même numéro le même jour, un ADR est écrit mais jamais ajouté à
# l'index, une section obligatoire saute parce que le gabarit n'a pas été
# recopié. Trois pannes silencieuses — rien ne casse, la trace des décisions
# devient juste fausse. Ce script transforme la convention (docs/adr/README.md)
# en contrôle mécanique, exécuté en pre-commit et en CI.
#
# Contrôles :
#   1. le gabarit et l'index existent, et le gabarit porte bien les sections
#      qu'il est censé imposer (sinon il propage une structure incomplète) ;
#   2. nom de fichier `NNN-slug.md` en kebab-case ASCII ;
#   3. numéros uniques ;
#   4. titre H1 `# ADR NNN — …`, le numéro du titre correspondant au fichier ;
#   5. les 5 sections `##` et les 3 sous-sections `###` de `Consequences` ;
#   6. statut déclaré dans la liste fermée (Proposed/Accepted/Superseded/Deprecated) ;
#   7. cohérence bidirectionnelle avec l'index : tout ADR y est listé, et tout
#      lien de l'index pointe vers un fichier existant.
#
# Exit 0 si tout est conforme, 1 sinon (avec une ligne par écart).
# Item E1 du plan d'outillage (Phase R).

set -euo pipefail

ADR_DIR="${1:-docs/adr}"
INDEX="$ADR_DIR/README.md"
TEMPLATE="$ADR_DIR/000-template.md"

# Sections structurelles imposées par la rule 03 (.claude/rules/03-commits-review.md).
REQUIRED_SECTIONS='## Status
## Context
## Options Considered
## Decision
## Consequences'
REQUIRED_SUBSECTIONS='### Positive
### Negative
### Neutral'

errors=0
fail() {
  echo "ERREUR: $*"
  errors=$((errors + 1))
}

# Un titre `##`/`###` compte comme présent seulement s'il est seul sur sa ligne
# (-x) et comparé littéralement (-F) : une mention en prose ne suffit pas.
has_heading() { grep -qxF "$2" "$1"; }

check_headings() {
  local file="$1" label="$2" heading
  while IFS= read -r heading; do
    has_heading "$file" "$heading" || fail "$label : section « $heading » manquante."
  done <<< "$REQUIRED_SECTIONS"
  while IFS= read -r heading; do
    has_heading "$file" "$heading" || fail "$label : sous-section « $heading » manquante sous Consequences."
  done <<< "$REQUIRED_SUBSECTIONS"
}

# --- 1. Prérequis ------------------------------------------------------------

[ -d "$ADR_DIR" ] || { echo "ERREUR: dossier ADR introuvable : $ADR_DIR"; exit 1; }
[ -f "$INDEX" ] || fail "index introuvable : $INDEX"
if [ -f "$TEMPLATE" ]; then
  check_headings "$TEMPLATE" "gabarit $TEMPLATE"
else
  fail "gabarit introuvable : $TEMPLATE"
fi

# --- 2..6. Contrôles par ADR -------------------------------------------------

numbers=""
adr_count=0

for file in "$ADR_DIR"/*.md; do
  base=$(basename "$file")
  # README.md = index, 000-template.md = gabarit : ni l'un ni l'autre n'est une décision.
  case "$base" in
    README.md | 000-template.md) continue ;;
  esac

  if ! printf '%s' "$base" | grep -qE '^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*\.md$'; then
    fail "$base : nom non conforme, attendu NNN-slug.md en kebab-case ASCII."
    continue
  fi

  adr_count=$((adr_count + 1))
  num=${base%%-*}
  numbers="$numbers$num"$'\n'

  title=$(head -1 "$file")
  if ! printf '%s' "$title" | grep -qE "^# ADR $num — .+"; then
    fail "$base : titre H1 non conforme, attendu « # ADR $num — … » (trouvé : « $title »)."
  fi

  check_headings "$file" "$base"

  # Statut = première ligne non vide après `## Status`. Le premier mot doit
  # appartenir à la liste fermée documentée dans docs/adr/README.md.
  status_line=$(awk '/^## Status$/ { found = 1; next } found && NF { print; exit }' "$file")
  if [ -z "$status_line" ]; then
    fail "$base : section Status vide."
  else
    # Tronque au premier caractère non alphabétique : « Accepted — 2026-08-04. » -> « Accepted ».
    first_word=${status_line%%[^A-Za-z]*}
    case "$first_word" in
      Proposed | Accepted | Superseded | Deprecated) ;;
      *) fail "$base : statut « $first_word » hors liste (Proposed|Accepted|Superseded|Deprecated)." ;;
    esac
  fi

  # 7a. Sens fichier -> index.
  if [ -f "$INDEX" ] && ! grep -qF "]($base)" "$INDEX"; then
    fail "$base : absent de l'index $INDEX (ajouter une ligne au tableau)."
  fi
done

if [ "$adr_count" -eq 0 ]; then
  fail "aucun ADR trouvé dans $ADR_DIR — le contrôle n'aurait rien vérifié."
fi

# 3. Numéros dupliqués : une collision rend un lien externe ambigu à jamais.
duplicates=$(printf '%s' "$numbers" | grep -v '^$' | sort | uniq -d || true)
if [ -n "$duplicates" ]; then
  while IFS= read -r dup; do
    fail "numéro d'ADR $dup utilisé par plusieurs fichiers : $(ls "$ADR_DIR/$dup"-*.md | tr '\n' ' ')"
  done <<< "$duplicates"
fi

# --- 7b. Sens index -> fichier ----------------------------------------------

if [ -f "$INDEX" ]; then
  linked=$(grep -oE '\([0-9]{3}-[a-z0-9-]+\.md\)' "$INDEX" | tr -d '()' | sort -u || true)
  if [ -n "$linked" ]; then
    while IFS= read -r target; do
      [ -f "$ADR_DIR/$target" ] || fail "index : lien vers « $target », fichier inexistant."
    done <<< "$linked"
  fi
fi

# --- Verdict -----------------------------------------------------------------

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "ERREUR: $errors écart(s) à la convention ADR (voir $INDEX)."
  exit 1
fi

echo "ok: $adr_count ADR conformes, index et gabarit à jour."
exit 0
