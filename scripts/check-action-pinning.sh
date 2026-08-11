#!/usr/bin/env bash
# Refuse une action tierce référencée par un tag mobile plutôt que par un SHA
# (REQ-SEC-006).
#
# ## Le défaut que ce contrôle traite
#
# `uses: foo/bar@v4` ne désigne pas un contenu, il désigne un **pointeur**. Le
# propriétaire de `foo/bar` peut le déplacer à tout moment, et la CI exécutera
# du code différent au prochain run — sans qu'aucun diff du dépôt ne le montre,
# sans PR, sans notification. C'est le vecteur d'attaque de la chaîne
# d'approvisionnement CI le plus documenté, et il n'a pas besoin d'un compromis
# du dépôt : compromettre le mainteneur amont suffit.
#
# Un SHA de 40 hexadécimaux désigne un contenu immuable. La montée de version
# redevient alors ce qu'elle doit être : un commit qu'on relit.
#
# ## Pourquoi `actions/` et `github/` sont dispensées
#
# Ce sont les actions de GitHub lui-même, exécutées sur l'infrastructure de
# GitHub. Les épingler protégerait contre un acteur qui contrôle déjà le runner
# — la menace est hors modèle. C'est aussi la ligne que trace le guide de
# durcissement de GitHub, qui ne demande le SHA que pour les actions tierces.
#
# Cette dispense est une **liste blanche**, pas une liste noire : tout ce qui
# n'est pas explicitement dispensé doit être épinglé. Une liste noire échouerait
# ouverte sur le cas inattendu, qui est précisément ce contre quoi un contrôle
# de chaîne d'approvisionnement existe.
#
# Usage : check-action-pinning.sh [répertoire]
# Codes de sortie : 0 conforme, 1 au moins une action tierce sur tag mobile.

set -euo pipefail

WORKFLOW_DIR="${1:-.github/workflows}"
VIOLATIONS=0

[ -d "$WORKFLOW_DIR" ] || { echo "ERREUR : répertoire introuvable : $WORKFLOW_DIR" >&2; exit 2; }

# Propriétaires dispensés : GitHub lui-même. Le `/` final est significatif —
# sans lui, un dépôt nommé `actions-malveillant/x` serait dispensé par préfixe.
is_first_party() {
  case "$1" in
    actions/*|github/*) return 0 ;;
    *) return 1 ;;
  esac
}

while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  file="${hit%%:*}"
  rest="${hit#*:}"
  line_no="${rest%%:*}"
  ref="${rest#*:}"
  # Isole la référence : `uses: owner/repo@version` → `owner/repo@version`.
  ref="$(printf '%s' "$ref" | sed -E 's/^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*//; s/[[:space:]]*(#.*)?$//')"

  # Les actions locales (`./chemin`) et les conteneurs (`docker://`) ne sont pas
  # des références mobiles vers un dépôt tiers.
  case "$ref" in
    ./*|docker://*|'') continue ;;
  esac

  action="${ref%@*}"
  version="${ref##*@}"

  is_first_party "$action" && continue

  # 40 hexadécimaux : la seule forme immuable.
  if printf '%s' "$version" | grep -qE '^[0-9a-f]{40}$'; then
    continue
  fi

  echo "  ECHEC : $file:$line_no — « $action@$version » est un tag mobile ; attendu un SHA de 40 hexadécimaux"
  VIOLATIONS=$((VIOLATIONS + 1))
done < <(grep -rnE '^[[:space:]]*-?[[:space:]]*uses:' "$WORKFLOW_DIR" 2>/dev/null || true)

if [ "$VIOLATIONS" -ne 0 ]; then
  echo
  echo "ECHEC : $VIOLATIONS action(s) tierce(s) sur tag mobile." >&2
  echo "Un tag peut être déplacé par son propriétaire : la CI exécuterait un autre code sans qu'aucun diff ne le montre." >&2
  echo "Résoudre le SHA du tag employé (sans monter de version) et l'inscrire, en gardant le tag en commentaire." >&2
  exit 1
fi
echo "ok: toute action tierce est épinglée par SHA ; seules les actions GitHub restent sur tag."
