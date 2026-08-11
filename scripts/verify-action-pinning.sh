#!/usr/bin/env bash
# Met `scripts/check-action-pinning.sh` en échec, cas par cas (REQ-SEC-006).
#
# Un contrôle d'épinglage a le défaut de sa cible : il est vert quand tout est
# épinglé **et** vert quand il ne lit rien. Un répertoire mal résolu, un `grep`
# qui ne matche plus la forme `- uses:`, et le rapport dit « ok » pendant que
# les workflows repartent sur des tags mobiles.
#
# La preuve est donc de lui soumettre les formes qu'il doit refuser, **et**
# celles qu'il doit laisser passer. Les secondes comptent autant : un contrôle
# qui refuserait aussi les actions de GitHub obligerait à épingler une trentaine
# de références sans bénéfice, et se ferait retirer.
#
# Le cas le plus intéressant est AC-4, la frontière de propriétaire. La dispense
# porte sur `actions/` et `github/` — avec le `/`. Sans lui, un dépôt nommé
# `actions-quelconque/x` serait dispensé par simple préfixe, ce qui transformerait
# la liste blanche en passoire au bénéfice de qui choisit bien son nom.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`.
#
# describe REQ-SEC-006 — la chaîne d'approvisionnement de la CI est figée

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO_ROOT/scripts/check-action-pinning.sh"
SANDBOX="$(mktemp -d -t verify-action-pinning-XXXXXX)"
FAILURES=0

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -f "$GUARD" ] || { echo "ECHEC : $GUARD introuvable" >&2; exit 1; }

SHA40='0123456789abcdef0123456789abcdef01234567'

# Écrit un workflow d'un seul `uses:` dans un répertoire jetable, y lance le
# garde-fou réel, et rend son code de sortie. Un répertoire par cas : sinon le
# premier refus masquerait tous les suivants et le harnais annoncerait N succès
# pour un seul motif réellement éprouvé.
run_guard_on() {
  local ref="$1" guard="${2:-$GUARD}"
  local dir
  dir="$(mktemp -d "$SANDBOX/case-XXXXXX")"
  printf 'jobs:\n  x:\n    steps:\n      - uses: %s\n' "$ref" > "$dir/wf.yml"
  local status=0
  bash "$guard" "$dir" >/dev/null 2>&1 || status=$?
  return "$status"
}

expect_refuse() {
  local label="$1" ref="$2"
  if run_guard_on "$ref"; then
    echo "  ECHEC : $label — accepté alors qu'il devait être refusé ($ref)"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ok : $label — refusé"
  fi
}

expect_accept() {
  local label="$1" ref="$2"
  if run_guard_on "$ref"; then
    echo "  ok : $label — accepté"
  else
    echo "  ECHEC : $label — refusé alors qu'il devait passer ($ref)"
    FAILURES=$((FAILURES + 1))
  fi
}

# it AC-1: les workflows réels du dépôt sont conformes
#
# Contrôle positif sur la vraie cible. Les fixtures ci-dessous prouvent que le
# garde-fou sait juger ; celui-ci prouve qu'il juge **ce dépôt**.
echo "phase 1 — les workflows réels doivent passer"
if bash "$GUARD" "$REPO_ROOT/.github/workflows" >/dev/null 2>&1; then
  echo "  ok : .github/workflows — accepté"
else
  echo "  ECHEC : le garde-fou refuse les workflows réels du dépôt"
  FAILURES=$((FAILURES + 1))
fi

# it AC-2: une action tierce sur tag mobile est refusée
echo "phase 2 — rejet : un tag peut être déplacé par son propriétaire"
expect_refuse "tag majeur"        "dorny/paths-filter@v4"
expect_refuse "tag précis"        "pnpm/action-setup@v4.1.0"
expect_refuse "branche"           "some/action@main"
expect_refuse "SHA court"         "some/action@0123456"

# it AC-3: une action tierce épinglée par SHA est acceptée
#
# Contrôle négatif. Sans lui, un garde-fou qui refuserait tout afficherait
# quatre « ok » en phase 2 et passerait pour un succès.
echo "phase 3 — acceptation : un SHA de 40 hexadécimaux est immuable"
expect_accept "SHA complet"       "anchore/sbom-action@$SHA40"
expect_accept "SHA sur sous-action" "google/osv-scanner-action/osv-scanner-action@$SHA40"

# it AC-4: la dispense porte sur le propriétaire exact, pas sur un préfixe
#
# Le cas qui décide de la valeur du contrôle. `actions/` et `github/` sont
# dispensés parce que ce sont les actions de GitHub. Si la comparaison se faisait
# sans le `/`, il suffirait de nommer son dépôt `actionsxyz/…` pour être dispensé.
echo "phase 4 — frontière de propriétaire : la dispense n'est pas un préfixe"
expect_accept "actions/ (GitHub)"       "actions/checkout@v5"
expect_accept "github/ (GitHub)"        "github/codeql-action/init@v3"
expect_refuse "propriétaire ressemblant" "actionsxyz/checkout@v5"
expect_refuse "propriétaire préfixé"     "github-community/x@v1"

# it AC-5: ce qui ne désigne pas un dépôt tiers est hors périmètre
echo "phase 5 — hors périmètre : action locale et image de conteneur"
expect_accept "action locale"     "./.github/actions/x"
expect_accept "image docker"      "docker://ghcr.io/google/osv-scanner-action:v2.5.0"

# it AC-6: la vérification sait elle-même échouer
#
# Contrôle de contrôle. Sans lui, un `run_guard_on` qui rendrait toujours 0 —
# répertoire mal construit, `bash` introuvable — afficherait « ok » sur toutes
# les acceptations et ne prouverait rien des refus.
echo "phase 6 — contrôle négatif : un garde-fou neutralisé doit être détecté"
NEUTERED="$SANDBOX/neutered-guard.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$NEUTERED"
if run_guard_on "dorny/paths-filter@v4" "$NEUTERED"; then
  echo "  ok : le harnais voit bien accepter le garde-fou neutralisé sur un tag que le vrai refuse"
else
  echo "  ECHEC : le harnais ne distingue pas un garde-fou neutralisé d'un garde-fou actif"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le contrôle d'épinglage ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: toute action tierce non épinglée est refusée, et les actions GitHub restent dispensées."
