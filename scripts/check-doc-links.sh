#!/usr/bin/env bash
# Refuse un lien relatif, dans un markdown versionné, qui ne mène pas à un
# fichier versionné (REQ-DOC-001).
#
# ## Le défaut que ce garde-fou attrape
#
# Ce dépôt est **public**, et son cadre de développement (`.claude/`) est
# **privé** — exclu par `.gitignore`. Les deux faits sont volontaires ; leur
# combinaison ne l'est pas. Un rédacteur qui écrit
# `[rule 19](../../.claude/rules/19-securite.md)` voit un lien qui fonctionne
# parfaitement sur son poste, parce que le fichier y est. Sur GitHub, le même
# lien est un 404.
#
# C'est un mode de panne désagréable : le contrôle local ne peut pas le voir,
# puisque localement **tout est correct**. Seul un contrôle qui interroge `git`
# — et non le disque — distingue « le fichier existe » de « le fichier existe
# pour un lecteur du dépôt ». D'où `git ls-files` plutôt qu'un `test -f`, qui
# rapporterait vert sur exactement le cas à attraper.
#
# Le dépôt en portait 8, dans 5 fichiers, dont 3 écrits le jour même où ce
# garde-fou a été posé. La vigilance était déjà demandée par la note de
# `docs/adr/README.md` ; elle n'a pas suffi — c'est l'argument habituel du dépôt
# pour transformer une consigne en contrôle.
#
# Le contrôle est **plus large que ce cas** : il attrape aussi un fichier
# déplacé, un chemin relatif faux d'un niveau, et un lien vers un artefact
# généré non versionné (`docs/requirements/_generated/`, cf. ADR 005). C'est
# d'ailleurs par là qu'il a payé : quatre liens d'ADR et de REQ désignaient un
# `015-…`/`010-…` renommé depuis, et l'ADR 009 **sortait du dépôt** vers le
# dossier produit privé — 404 public, et un chemin interne exposé au passage.
#
# ## Périmètre : ce que le contrôle regarde, et pourquoi pas le reste
#
# Le contrôle porte sur les markdown que **ce dépôt rédige et maintient**. Deux
# familles en sont exclues, après comptage plutôt que par principe (rule 21,
# « calibrer avant de gater ») :
#
#   - `docs/prd/**` (29 liens) : spécifications **vendorées** depuis le site
#     produit. Leurs liens sont des chemins absolus de ce site
#     (`/specifications/backend/endpoints`), pas des chemins de fichiers ; ils
#     sont corrects là-bas et n'ont pas de sens ici. Les réécrire ferait diverger
#     la copie de sa source, ce que le vendoring existe précisément pour éviter
#     (même raisonnement que l'ADR 016 sur la suite de conformité).
#   - `artifacts/**` (20 liens) : mémoire de session, écrite par l'outillage.
#     Ce sont des documents de travail internes, pas de la documentation
#     publiée ; leurs renvois au cadre local `.claude/` y sont légitimes.
#
# Hors de ces deux familles, le compte est **zéro**. Le contrôle est donc posé
# bloquant d'emblée : le seuil n'est pas arbitraire, il est mesuré.
#
# Lancé en pre-commit (sur les markdown) et dans le job CI `Quality`.
#
# describe REQ-DOC-001 — aucun lien mort dans la documentation publiée

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VIOLATIONS=0

# Index des fichiers versionnés, chargé une fois. Interroger `git ls-files` par
# lien coûterait un fork par lien ; sur ~120 markdown, c'est la différence entre
# un contrôle qu'on garde en pre-commit et un contrôle qu'on désactive.
TRACKED="$(git ls-files)"

# Normalise un chemin **sans toucher au disque** : `realpath` suivrait les liens
# symboliques et rendrait un chemin absolu hors du dépôt, inutilisable face à
# `git ls-files`. Pile de segments : `.` ignoré, `..` dépile, le reste empile.
# Un segment vide est ignoré, ce qui absorbe au passage les `//` et le `/` final
# d'un lien vers un répertoire (`docs/adr/`).
normalize() {
  local path="$1" seg
  local -a parts=() stack=()
  IFS='/' read -ra parts <<< "$path"
  for seg in "${parts[@]+"${parts[@]}"}"; do
    case "$seg" in
      ''|'.') ;;
      '..')
        if [ "${#stack[@]}" -gt 0 ]; then
          # Indice calculé, jamais `stack[-1]` : le bash 3.2 livré par macOS
          # refuse les indices négatifs, et le dépôt se développe dessus. Le
          # symptôme est traître — `unset` échoue, la pile ne dépile pas, et le
          # chemin résolu part dans une branche qui n'existe pas au lieu de
          # remonter d'un cran.
          unset "stack[$(( ${#stack[@]} - 1 ))]"
          # Réindexe : `unset` laisse un trou, et un tableau troué se
          # reconcatène dans le désordre au segment suivant.
          stack=("${stack[@]+"${stack[@]}"}")
        fi
        ;;
      *) stack+=("$seg") ;;
    esac
  done
  local IFS='/'
  printf '%s' "${stack[*]+"${stack[*]}"}"
}

is_tracked() {
  local target="$1"
  # Fichier versionné…
  if printf '%s\n' "$TRACKED" | grep -qxF -- "$target"; then
    return 0
  fi
  # …ou répertoire versionné, c'est-à-dire portant au moins un fichier suivi.
  # `grep -F` sur le préfixe avec son `/` final : pas de regex, donc pas
  # d'échappement à oublier sur un chemin qui contient un point.
  if printf '%s\n' "$TRACKED" | grep -qF -- "$target/"; then
    return 0
  fi
  return 1
}

while IFS= read -r file; do
  dir="$(dirname "$file")"
  # Une seule passe `awk` par fichier — pas un `grep` par ligne, qui forkait
  # autant de fois qu'il y a de lignes dans `docs/`.
  #
  # `awk` fait ici ce qu'un motif seul ne peut pas : ignorer le **code**. Une
  # documentation qui décrit une convention de liens en cite forcément la
  # syntaxe, et ce fichier-ci en est l'exemple — REQ-DOC-001 montre le lien
  # fautif `[rule 19](…)` entre accents graves pour l'expliquer. Un extracteur
  # naïf y voit un lien mort et refuse la documentation qui décrit le contrôle.
  # Le cas s'est produit au premier commit de ce garde-fou, sur son propre REQ.
  #
  # Deux formes sont donc neutralisées : les blocs délimités par ``` et les
  # `spans` en ligne. Plusieurs liens par ligne restent gérés — cas fréquent
  # dans les tableaux d'options des ADR.
  while IFS="$(printf '\t')" read -r line_no target; do
    [ -n "$target" ] || continue
    case "$target" in
      # Liens externes, ancres pures, adresses : rien à résoudre sur le disque.
      http://*|https://*|mailto:*|'#'*|'') continue ;;
    esac
    # Retire l'ancre (`fichier.md#section`) : seule la cible fichier se résout.
    target="${target%%#*}"
    [ -n "$target" ] || continue
    resolved="$(normalize "$dir/$target")"
    if [ -z "$resolved" ] || ! is_tracked "$resolved"; then
      echo "  ECHEC : $file:$line_no — « $target » ne mène à aucun fichier versionné ($resolved)"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done < <(awk '
    /^[ \t]*```/ { fence = !fence; next }
    fence { next }
    {
      line = $0
      gsub(/`[^`]*`/, "", line)
      while (match(line, /\]\([^)]*\)/)) {
        print NR "\t" substr(line, RSTART + 2, RLENGTH - 3)
        line = substr(line, RSTART + RLENGTH)
      }
    }
  ' "$file")
  # `:(exclude)` est un pathspec magique de git, pas un filtre applicatif : les
  # fichiers exclus ne sont jamais lus, et la raison de leur exclusion vit dans
  # l'en-tête plutôt que dans un `grep -v` que personne ne saurait justifier
  # six mois plus tard.
done < <(git ls-files '*.md' ':(exclude)docs/prd/**' ':(exclude)artifacts/**')

if [ "$VIOLATIONS" -ne 0 ]; then
  echo
  echo "ECHEC : $VIOLATIONS lien(s) mort(s) — ils rendent 404 pour un lecteur du dépôt public." >&2
  echo "Un fichier non versionné (cadre local .claude/, artefact généré) se cite en clair, pas en lien." >&2
  exit 1
fi
echo "ok: tous les liens relatifs des markdown versionnés mènent à un fichier versionné."
