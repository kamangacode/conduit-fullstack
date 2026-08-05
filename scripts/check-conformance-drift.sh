#!/usr/bin/env bash
# Compare les copies vendorées des suites de conformité à leur amont
# (ADR 016 pour l'API, ADR 018 pour le front).
#
# Ces copies existent pour que le verdict de conformité soit reproductible et
# hors ligne. Elles créent en échange une faille que rien d'autre ne couvre : il
# suffirait de retoucher l'assertion qui dérange pour repasser au vert, et le
# geste ne se verrait pas dans un diff de plusieurs milliers de lignes. C'est la
# seule triche capable de vider l'exercice de son sens, et ce script existe pour
# la rendre détectable (REQ-CONF-001 AC-3, REQ-CONF-002 AC-3).
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
#
# Usage : check-conformance-drift.sh [api|web]   (sans argument : les deux)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

UPSTREAM_REPO="realworld-apps/realworld"

# --- Déclaration des suites --------------------------------------------------
#
# Une suite = un dossier local de conformité (qui porte son `UPSTREAM.md`), un
# sous-dossier de copie, et le chemin amont correspondant. Les deux suites sont
# épinglées au **même** commit : elles décrivent un seul contrat, chacune d'un
# côté du fil.
# `NOT_VENDORED` liste les chemins amont **volontairement** absents de la copie,
# un par ligne. Cette déclaration est le prix du passage à la comparaison
# récursive, et elle vaut mieux que ce qu'elle remplace : la version précédente
# ne listait que les `*.hurl`, ce qui excluait `run-hurl-tests.sh` sans que
# personne l'ait décidé — et laissait au passage ajouter en local n'importe quel
# fichier d'une autre extension sans que le contrôle le voie.
#
# Une exclusion déclarée se relit et se discute ; une exclusion qui tombe d'un
# glob ne se voit pas.
suite_config() {
  NOT_VENDORED=""
  case "$1" in
    api)
      LOCAL_ROOT="apps/api/conformance"
      SUITE_SUBDIR="hurl"
      UPSTREAM_PATH="specs/api/hurl"
      # Lanceur amont : son `HOST` par défaut et l'exemple de son README
      # (`http://localhost:3000/api`) sont incohérents avec les fichiers `.hurl`,
      # qui écrivent déjà `{{host}}/api/…`. `scripts/test-conformance.sh` appelle
      # `hurl` directement, avec l'origine seule.
      NOT_VENDORED="run-hurl-tests.sh"
      ;;
    web)
      LOCAL_ROOT="apps/web/conformance"
      SUITE_SUBDIR="e2e"
      UPSTREAM_PATH="specs/e2e"
      # Rien : le dossier amont est copié en entier, `SELECTORS.md` compris.
      ;;
    *)
      echo "ERREUR: suite inconnue « $1 » (attendu : api ou web)."
      exit 2
      ;;
  esac

  # `CONFORMANCE_DIR` n'existe que pour `verify-conformance-drift.sh`, qui pointe
  # ce script vers un dossier de fixtures pour éprouver ses modes de défaillance.
  # Un contrôle dont on n'a jamais constaté qu'il sait échouer n'est pas un
  # contrôle — et le seul moyen de le constater est de lui soumettre une copie
  # retouchée, ce qu'on ne fait pas sur la vraie.
  LOCAL_ROOT="${CONFORMANCE_DIR:-$LOCAL_ROOT}"
  SUITE_DIR="$LOCAL_ROOT/$SUITE_SUBDIR"
  UPSTREAM_DOC="$LOCAL_ROOT/UPSTREAM.md"
}

# Liste récursive des fichiers du dossier amont, chemins **relatifs** à
# `UPSTREAM_PATH`.
#
# Un `contents` API à plat suffisait tant que la seule suite vendorée était la
# suite Hurl, qui n'a pas de sous-dossier. La suite e2e en a un, `helpers/`, et
# c'est justement lui qui concentre le pouvoir de nuisance : `helpers/auth.ts`
# définit l'inscription et la connexion, donc l'assouplir rendrait vertes des
# dizaines de specs sans qu'un seul `.spec.ts` change. Un lister à plat aurait
# rapporté « ok » sur cette retouche-là.
#
# L'arbre git récursif règle les deux suites d'un seul appel. Le drapeau
# `truncated` est lu : sur un arbre tronqué, l'absence d'un fichier ne veut rien
# dire, et conclure serait pire que ne pas conclure.
fetch_upstream_files() {
  local sha="$1" path="$2"
  curl -sfL --max-time 30 \
    "https://api.github.com/repos/${UPSTREAM_REPO}/git/trees/${sha}?recursive=1" \
    | node -e '
      let d = ""
      process.stdin.on("data", c => (d += c)).on("end", () => {
        const prefix = process.argv[1] + "/"
        try {
          const tree = JSON.parse(d)
          if (tree.truncated) { process.exit(3) }
          const files = (tree.tree ?? [])
            .filter(e => e.type === "blob" && e.path.startsWith(prefix))
            .map(e => e.path.slice(prefix.length))
            .sort()
          console.log(files.join("\n"))
        } catch { process.exit(4) }
      })
    ' "$path"
}

# Le SHA du dernier commit amont **sur ce chemin**.
#
# Il passe par un vrai parseur JSON, pas par un `grep` : la réponse porte un
# `"sha"` par commit **plus** un par parent et un par arbre. Prendre le premier
# match donne bien le commit ici, mais par coïncidence de l'ordre des clés — et
# la même écriture appliquée au second commit rend un identifiant de parent, que
# l'API des contenus ne connaît pas. Piège rencontré en écrivant
# `verify-conformance-drift.sh`.
fetch_head_sha() {
  curl -sfL --max-time 30 \
    "https://api.github.com/repos/${UPSTREAM_REPO}/commits?path=$1&per_page=1" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d)[0]?.sha??"")}catch{console.log("")}})'
}

# Vérifie une suite. Rend 1 si la copie locale a été retouchée, 0 sinon (y
# compris quand l'amont est injoignable ou que le contrat a évolué).
check_suite() {
  local suite="$1"
  suite_config "$suite"

  echo "=== suite « $suite » ($SUITE_DIR) ==="

  if [ ! -d "$SUITE_DIR" ]; then
    echo "ERREUR: $SUITE_DIR est introuvable."
    return 1
  fi

  # Le SHA est lu dans le document de provenance plutôt que codé ici : une seule
  # source, et le document est ce qu'un lecteur ouvre en premier.
  local pinned_sha
  pinned_sha="$(grep -oE '[0-9a-f]{40}' "$UPSTREAM_DOC" | head -1 || true)"
  if [ -z "$pinned_sha" ]; then
    echo "ERREUR: aucun SHA sur 40 caractères trouvé dans $UPSTREAM_DOC."
    echo "        Le contrôle de dérive ne sait pas à quelle version comparer."
    return 1
  fi

  echo "→ SHA épinglé : $pinned_sha"

  local upstream_files
  if ! upstream_files="$(fetch_upstream_files "$pinned_sha" "$UPSTREAM_PATH")"; then
    # Ne pas conclure est une réponse valide, et la seule honnête ici : sans
    # l'amont, on ne peut affirmer NI que la copie est intacte, NI qu'elle ne
    # l'est pas. Sortir 0 en le disant vaut mieux que rougir sur une panne réseau.
    echo "AVERTISSEMENT: amont injoignable ou arbre tronqué — contrôle de dérive non concluant."
    echo "               Les suites de conformité elles-mêmes ne dépendent pas du réseau."
    return 0
  fi

  if [ -z "$upstream_files" ]; then
    echo "AVERTISSEMENT: aucun fichier listé en amont sous $UPSTREAM_PATH — contrôle non concluant."
    return 0
  fi

  # Les exclusions assumées sortent de la comparaison, et sont annoncées : une
  # ligne dans la sortie du contrôle vaut mieux qu'un filtre implicite.
  if [ -n "$NOT_VENDORED" ]; then
    echo "→ non vendoré volontairement : $(printf '%s' "$NOT_VENDORED" | tr '\n' ' ')"
    upstream_files="$(printf '%s\n' "$upstream_files" \
      | grep -vxF -f <(printf '%s\n' "$NOT_VENDORED") || true)"
  fi

  # Côté local, la même récursion : sans elle, un fichier ajouté dans un
  # sous-dossier passerait pour absent des deux côtés.
  #
  # `LC_ALL=C` n'est pas décoratif : la liste amont est triée par le `.sort()` de
  # JavaScript, qui compare des points de code, là où `sort(1)` suit la locale et
  # ignore la casse. `SELECTORS.md` se rangeait donc avant `articles.spec.ts` d'un
  # côté et après de l'autre, et `diff` rapportait le même fichier « manquant » et
  # « ajouté ». Un faux positif qui, répété, apprend à ne plus lire la sortie.
  local local_files
  local_files="$(cd "$SUITE_DIR" && find . -type f | sed 's#^\./##' | LC_ALL=C sort)"

  local work_dir retouched=0
  work_dir="$(mktemp -d)"

  # Fichiers présents d'un côté seulement. Un ajout local compte autant qu'une
  # suppression : glisser un fichier maison dans le dossier ferait passer pour
  # officielle une assertion écrite par nous.
  local added_or_removed
  if ! added_or_removed="$(diff <(printf '%s\n' "$upstream_files") <(printf '%s\n' "$local_files"))"; then
    echo
    echo "DÉFAUT: la liste des fichiers diverge de l'amont."
    printf '%s\n' "$added_or_removed" | sed 's/^</  manquant en local : /; s/^>/  ajouté en local  : /'
    retouched=1
  fi

  # Comparaison octet pour octet des fichiers présents des deux côtés.
  local name
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    printf '%s\n' "$local_files" | grep -qxF "$name" || continue

    mkdir -p "$work_dir/$(dirname "$name")"
    if ! curl -sfL --max-time 30 -o "$work_dir/$name" \
      "https://raw.githubusercontent.com/${UPSTREAM_REPO}/${pinned_sha}/${UPSTREAM_PATH}/${name}"; then
      echo "AVERTISSEMENT: $name non récupérable — non comparé."
      continue
    fi

    if ! cmp -s "$work_dir/$name" "$SUITE_DIR/$name"; then
      echo
      echo "DÉFAUT: $name diffère de l'amont au SHA épinglé."
      diff "$work_dir/$name" "$SUITE_DIR/$name" | head -20
      retouched=1
    fi
  done <<< "$upstream_files"

  rm -rf "$work_dir"

  # L'évolution amont se rapporte séparément, et après : c'est une information,
  # pas un défaut, et la mélanger au diagnostic précédent brouillerait les deux.
  local head_sha
  if head_sha="$(fetch_head_sha "$UPSTREAM_PATH")" && [ -n "$head_sha" ]; then
    if [ "$head_sha" != "$pinned_sha" ]; then
      echo
      echo "INFO: le contrat a évolué en amont."
      echo "      épinglé : $pinned_sha"
      echo "      amont   : $head_sha"
      echo "      Remonter la copie est un geste manuel et délibéré — voir $UPSTREAM_DOC."
    fi
  fi

  if [ "$retouched" -ne 0 ]; then
    echo
    echo "La suite officielle ne s'édite pas : une assertion qui échoue est un"
    echo "défaut de ce dépôt, pas une assertion à corriger."
    return 1
  fi

  echo
  echo "ok: les $(printf '%s\n' "$upstream_files" | wc -l | tr -d ' ') fichiers de la suite « $suite » sont identiques à l'amont au SHA épinglé."
  return 0
}

suites=("api" "web")
if [ "$#" -gt 0 ]; then
  suites=("$@")
fi

# Toutes les suites sont examinées avant de conclure : s'arrêter à la première
# retouchée cacherait l'état de l'autre, et c'est précisément le moment où on
# veut voir les deux.
status=0
for suite in "${suites[@]}"; do
  check_suite "$suite" || status=1
  echo
done

exit "$status"
