#!/usr/bin/env bash
# Met `scripts/check-doc-links.sh` en échec, cas par cas (REQ-DOC-001).
#
# Un vérificateur de liens a un mode de panne qui lui est propre : il est vert
# quand tout va bien **et** vert quand il ne regarde rien. Une erreur de pathspec,
# un `git ls-files` qui ne rend aucun markdown, une normalisation qui échoue en
# silence — dans les trois cas le rapport dit « ok », et le dépôt publie ses 404.
# La seule preuve est de lui soumettre un lien mort et de constater le refus.
#
# Le harnais exécute **le script réel**, recopié tel quel dans un dépôt jetable :
# le garde-fou déduit sa racine de son propre chemin, donc l'éprouver ailleurs
# suppose de l'y déplacer. Ce qui est copié est le fichier, jamais sa logique —
# réécrire la normalisation ici prouverait que la réécriture fonctionne, la
# tautologie que ce dépôt a déjà rencontrée en F2.
#
# Le cas qui justifie tout le dispositif est AC-2, et il mérite d'être lu deux
# fois : un lien vers un fichier **présent sur le disque mais non versionné**.
# C'est exactement la forme qu'a prise le défaut réel — `.claude/rules/…` existe
# chez le rédacteur, donc `test -f` le déclare bon, et le lien est un 404 pour
# tout le monde. Un contrôle écrit avec `test -f` aurait rapporté vert sur les
# huit liens morts que le dépôt portait.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`.
#
# describe REQ-DOC-001 — aucun lien mort dans la documentation publiée

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO_ROOT/scripts/check-doc-links.sh"
SANDBOX="$(mktemp -d -t verify-doc-links-XXXXXX)"
FAILURES=0

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -f "$GUARD" ] || { echo "ECHEC : $GUARD introuvable" >&2; exit 1; }

# --- Bac à sable --------------------------------------------------------------
#
# Un dépôt git jetable, jamais le dépôt courant : le garde-fou lit `git ls-files`,
# donc l'éprouver ici supposerait de versionner des fixtures cassées pour les
# retirer ensuite. Un outil de diagnostic qui laisse des traces dans l'historique
# de celui qui le lance se fait désinstaller à la première mauvaise surprise.
mkdir -p "$SANDBOX/scripts" "$SANDBOX/docs/adr" "$SANDBOX/docs/prd" "$SANDBOX/artifacts" "$SANDBOX/private"
cp "$GUARD" "$SANDBOX/scripts/check-doc-links.sh"

git -C "$SANDBOX" init --quiet
git -C "$SANDBOX" config user.email "canary@example.invalid"
git -C "$SANDBOX" config user.name "canary"

# `private/` joue le rôle de `.claude/` : présent sur le disque, exclu de git.
printf 'private/\n' > "$SANDBOX/.gitignore"
printf 'cadre local\n' > "$SANDBOX/private/regle.md"
printf '# cible\n' > "$SANDBOX/docs/adr/002-cible.md"

commit_fixtures() {
  git -C "$SANDBOX" add -A
  git -C "$SANDBOX" -c commit.gpgsign=false commit --quiet --no-verify -m "fixture" || true
}

# Écrit un markdown, le versionne, lance le garde-fou réel depuis le bac à sable
# et rend son code de sortie. Le fichier est retiré ensuite pour que chaque cas
# soit indépendant : sinon le premier refus masquerait tous les suivants et le
# harnais annoncerait N succès pour un seul cas réellement éprouvé.
run_guard_on() {
  local path="$1" content="$2" guard="${3:-$SANDBOX/scripts/check-doc-links.sh}"
  mkdir -p "$SANDBOX/$(dirname "$path")"
  printf '%s\n' "$content" > "$SANDBOX/$path"
  commit_fixtures
  local status=0
  ( cd "$SANDBOX" && bash "$guard" >/dev/null 2>&1 ) || status=$?
  git -C "$SANDBOX" rm --quiet -f -- "$path" >/dev/null 2>&1 || rm -f "$SANDBOX/$path"
  commit_fixtures
  return "$status"
}

expect_reject() {
  local label="$1" path="$2" content="$3"
  if run_guard_on "$path" "$content"; then
    echo "  ECHEC : $label — le contrôle a accepté un lien mort"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ok : $label — refusé"
  fi
}

expect_accept() {
  local label="$1" path="$2" content="$3"
  if run_guard_on "$path" "$content"; then
    echo "  ok : $label — accepté"
  else
    echo "  ECHEC : $label — le contrôle a refusé un lien légitime"
    FAILURES=$((FAILURES + 1))
  fi
}

commit_fixtures

# it AC-1: un lien vers un fichier absent est refusé
echo "phase 1 — rejet : un lien qui ne mène nulle part"
expect_reject "fichier inexistant"      "docs/adr/a.md" "voir [cible](003-absente.md)"
expect_reject "chemin faux d'un niveau" "docs/adr/b.md" "voir [cible](../002-cible.md)"

# it AC-2: un lien vers un fichier présent mais NON VERSIONNÉ est refusé
#
# Le cœur du dispositif. Le fichier existe : un contrôle écrit avec `test -f`
# rapporterait vert, et c'est précisément la forme qu'avait le défaut réel
# (`.claude/rules/…`, présent chez le rédacteur, absent du dépôt public).
echo "phase 2 — rejet : le fichier existe sur le disque, mais pas dans le dépôt"
expect_reject "cible gitignorée"        "docs/adr/c.md" "voir [règle](../../private/regle.md)"

# it AC-3: un lien vers un fichier versionné est accepté
#
# Contrôle négatif. Sans lui, un garde-fou qui refuserait tout afficherait « ok »
# sur toute la phase 1 et passerait pour un succès. La traversée `..` est ici
# volontaire : c'est elle qui a révélé que `unset tableau[-1]` échoue en silence
# sous le bash 3.2 de macOS, laissant la pile non dépilée et le chemin résolu
# dans une branche qui n'existe pas.
echo "phase 3 — acceptation : les liens légitimes ne doivent jamais être bloqués"
expect_accept "même dossier"            "docs/adr/d.md" "voir [cible](002-cible.md)"
expect_accept "traversée .."            "docs/e.md"     "voir [cible](../docs/adr/002-cible.md)"
expect_accept "répertoire versionné"    "docs/f.md"     "voir [dossier](adr/)"

# it AC-4: les liens externes et les ancres pures sont hors périmètre
echo "phase 4 — hors périmètre : rien à résoudre sur le disque"
expect_accept "lien http"               "docs/g.md" "voir [spec](https://example.invalid/x)"
expect_accept "adresse mailto"          "docs/h.md" "voir [contact](mailto:x@example.invalid)"
expect_accept "ancre pure"              "docs/i.md" "voir [section](#contexte)"
expect_accept "ancre sur fichier"       "docs/adr/j.md" "voir [cible](002-cible.md#status)"

# it AC-5: les markdown vendorés et la mémoire de session sont exclus
#
# Exclusions mesurées, pas décrétées : 29 liens dans `docs/prd/**` (chemins
# absolus du site produit, corrects là-bas) et 20 dans `artifacts/**` (documents
# de travail internes). Les inclure rendrait le contrôle rouge en permanence,
# donc désactivé — l'issue la plus commune d'un gate non calibré (rule 21).
echo "phase 5 — périmètre : vendoré et mémoire de session restent hors du contrôle"
expect_accept "spec vendorée"           "docs/prd/spec.md"      "voir [x](/specifications/backend/endpoints)"
expect_accept "mémoire de session"      "artifacts/session.md"  "voir [règle](../private/regle.md)"

# it AC-6: une syntaxe de lien citée comme du code n'est pas un lien
#
# Cas trouvé en production, au sens propre : ce garde-fou a **refusé son propre
# REQ** au premier commit, parce que REQ-DOC-001 montre le lien fautif entre
# accents graves pour l'expliquer. Une documentation qui décrit une convention de
# liens en cite forcément la syntaxe ; un extracteur qui l'ignore rend le sujet
# indocumentable.
echo "phase 6 — code : une syntaxe de lien citée n'est pas un lien"
expect_accept "span en ligne"  "docs/k.md" 'écrire `[x](003-absente.md)` est fautif'
# La clôture est assemblée plutôt qu'écrite : trois accents graves à l'intérieur
# d'une chaîne shell se prêtent trop bien à une substitution de commande, et une
# fixture qu'on croit poser ne prouve rien si elle n'arrive pas intacte.
FENCE='```'
expect_accept "bloc délimité"  "docs/l.md" \
  "$(printf 'exemple :\n%s\n[x](003-absente.md)\n%s\nfin' "$FENCE" "$FENCE")"

# it AC-7: la vérification sait elle-même échouer
#
# Contrôle de contrôle. Sans lui, un `run_guard_on` qui rendrait toujours 0 —
# chemin mal construit, `cd` en échec, `bash` introuvable — ferait afficher « ok »
# partout et la vérification deviendrait un no-op vert. Le dépôt a déjà attrapé
# un faux « ok » de ce genre sur un grep (item E3).
echo "phase 7 — contrôle négatif : un contrôle neutralisé doit être détecté"
NEUTERED="$SANDBOX/neutered-guard.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$NEUTERED"
if run_guard_on "docs/adr/z.md" "voir [cible](003-absente.md)" "$NEUTERED"; then
  echo "  ok : le harnais voit bien accepter le contrôle neutralisé sur un cas que le vrai refuse"
else
  echo "  ECHEC : le harnais ne distingue pas un contrôle neutralisé d'un contrôle actif"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le contrôle des liens ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: le contrôle refuse les liens morts, y compris vers un fichier non versionné, et laisse passer les liens légitimes."
