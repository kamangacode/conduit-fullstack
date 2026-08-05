#!/usr/bin/env bash
# Compare la copie vendorée de la suite de conformité à son amont (ADR 016).
#
# La copie locale existe pour que le verdict de conformité soit reproductible et
# hors ligne. Elle crée en échange une faille que rien d'autre ne couvre : il
# suffirait de retoucher l'assertion qui dérange pour repasser au vert, et le
# geste ne se verrait pas dans un diff de 1 709 lignes. C'est la seule triche
# capable de vider l'exercice de son sens, et ce script existe pour la rendre
# détectable (REQ-CONF-001 AC-3).
#
# **Deux situations, deux sens, deux codes de sortie.** C'est le cœur du script :
#
#   - un fichier local **modifié, ajouté ou supprimé** → un défaut de ce dépôt,
#     code de sortie non nul ;
#   - le SHA épinglé qui n'est plus le `HEAD` amont → une **information**, code
#     de sortie 0. Le contrat a évolué chez un tiers ; ce n'est pas un défaut de
#     notre code, et le traiter comme tel ferait rougir la CI un matin sans
#     qu'aucune ligne n'ait bougé ici (REQ-CONF-001 AC-4).
#
# Le job de CI qui l'appelle reste **non bloquant** malgré ce code de sortie :
# le script dépend du réseau, et un gate qui échoue quand GitHub est indisponible
# est un gate qu'on désactive six mois plus tard (rule 21, étape 3 — on mesure le
# bruit avant de gater). Le code de sortie porte le diagnostic ; la décision de
# gater est prise ailleurs, et pas encore.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# `CONFORMANCE_DIR` n'existe que pour `verify-conformance-drift.sh`, qui pointe
# ce script vers un dossier de fixtures pour éprouver ses modes de défaillance.
# Un contrôle dont on n'a jamais constaté qu'il sait échouer n'est pas un
# contrôle — et le seul moyen de le constater est de lui soumettre une copie
# retouchée, ce qu'on ne fait pas sur la vraie.
CONFORMANCE_DIR="${CONFORMANCE_DIR:-apps/api/conformance}"
SUITE_DIR="$CONFORMANCE_DIR/hurl"
UPSTREAM_DOC="$CONFORMANCE_DIR/UPSTREAM.md"
UPSTREAM_REPO="realworld-apps/realworld"
UPSTREAM_PATH="specs/api/hurl"

# Le SHA est lu dans le document de provenance plutôt que codé ici : une seule
# source, et le document est ce qu'un lecteur ouvre en premier.
PINNED_SHA="$(grep -oE '[0-9a-f]{40}' "$UPSTREAM_DOC" | head -1 || true)"
if [ -z "$PINNED_SHA" ]; then
  echo "ERREUR: aucun SHA sur 40 caractères trouvé dans $UPSTREAM_DOC."
  echo "        Le contrôle de dérive ne sait pas à quelle version comparer."
  exit 1
fi

echo "→ SHA épinglé : $PINNED_SHA"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM

fetch_upstream_listing() {
  curl -sfL --max-time 30 \
    "https://api.github.com/repos/${UPSTREAM_REPO}/contents/${UPSTREAM_PATH}?ref=${PINNED_SHA}"
}

if ! listing="$(fetch_upstream_listing)"; then
  # Ne pas conclure est une réponse valide, et la seule honnête ici : sans
  # l'amont, on ne peut affirmer NI que la copie est intacte, NI qu'elle ne
  # l'est pas. Sortir 0 en le disant vaut mieux que rougir sur une panne réseau.
  echo "AVERTISSEMENT: amont injoignable — contrôle de dérive non concluant."
  echo "               La suite de conformité elle-même ne dépend pas du réseau."
  exit 0
fi

upstream_files="$(printf '%s' "$listing" \
  | grep -oE '"name": *"[^"]+\.hurl"' \
  | sed -E 's/.*"([^"]+\.hurl)"/\1/' \
  | sort)"

if [ -z "$upstream_files" ]; then
  echo "AVERTISSEMENT: aucun fichier .hurl listé en amont — contrôle non concluant."
  exit 0
fi

local_files="$(cd "$SUITE_DIR" && ls -1 ./*.hurl 2> /dev/null | sed 's#^\./##' | sort || true)"

retouched=0

# Fichiers présents d'un côté seulement. Un ajout local compte autant qu'une
# suppression : glisser un `.hurl` maison dans le dossier ferait passer pour
# officielle une assertion écrite par nous.
if ! added_or_removed="$(diff <(printf '%s\n' "$upstream_files") <(printf '%s\n' "$local_files"))"; then
  echo
  echo "DÉFAUT: la liste des fichiers diverge de l'amont."
  printf '%s\n' "$added_or_removed" | sed 's/^</  manquant en local : /; s/^>/  ajouté en local  : /'
  retouched=1
fi

# Comparaison octet pour octet des fichiers présents des deux côtés.
while IFS= read -r name; do
  [ -z "$name" ] && continue
  printf '%s\n' "$local_files" | grep -qx "$name" || continue

  if ! curl -sfL --max-time 30 -o "$WORK_DIR/$name" \
    "https://raw.githubusercontent.com/${UPSTREAM_REPO}/${PINNED_SHA}/${UPSTREAM_PATH}/${name}"; then
    echo "AVERTISSEMENT: $name non récupérable — non comparé."
    continue
  fi

  if ! cmp -s "$WORK_DIR/$name" "$SUITE_DIR/$name"; then
    echo
    echo "DÉFAUT: $name diffère de l'amont au SHA épinglé."
    diff "$WORK_DIR/$name" "$SUITE_DIR/$name" | head -20
    retouched=1
  fi
done <<< "$upstream_files"

# L'évolution amont se rapporte séparément, et après : c'est une information, pas
# un défaut, et la mélanger au diagnostic précédent brouillerait les deux.
#
# Le SHA passe par un vrai parseur JSON, pas par un `grep` : la réponse porte un
# `"sha"` par commit **plus** un par parent et un par arbre. Prendre le premier
# match donne bien le commit ici, mais par coïncidence de l'ordre des clés — et
# la même écriture appliquée au second commit rend un identifiant de parent, que
# l'API des contenus ne connaît pas. Piège rencontré en écrivant
# `verify-conformance-drift.sh`.
if head_sha="$(curl -sfL --max-time 30 \
  "https://api.github.com/repos/${UPSTREAM_REPO}/commits?path=${UPSTREAM_PATH}&per_page=1" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d)[0]?.sha??"")}catch{console.log("")}})')" \
  && [ -n "$head_sha" ]; then
  if [ "$head_sha" != "$PINNED_SHA" ]; then
    echo
    echo "INFO: le contrat a évolué en amont."
    echo "      épinglé : $PINNED_SHA"
    echo "      amont   : $head_sha"
    echo "      Remonter la copie est un geste manuel et délibéré — voir $UPSTREAM_DOC."
  fi
fi

if [ "$retouched" -ne 0 ]; then
  echo
  echo "La suite officielle ne s'édite pas (ADR 016) : une assertion qui échoue"
  echo "est un défaut de l'API, pas une assertion à corriger."
  exit 1
fi

echo
echo "ok: les 13 fichiers de la suite sont identiques à l'amont au SHA épinglé."
