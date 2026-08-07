#!/usr/bin/env bash
# Met `scripts/secret-guard.sh` en échec, motif par motif (REQ-SEC-001).
#
# Un garde-fou de secrets a une propriété désagréable : il est **silencieux
# quand il marche et silencieux quand il est cassé**. Un commit qui passe ne
# dit pas si le hook a examiné le diff ou s'il a sorti 0 sur une liste de
# fichiers vide. La seule preuve est de lui soumettre un vrai secret et de
# constater qu'il refuse.
#
# Ce script n'est donc pas un test de la regex : il exécute **le script réel**
# appelé par le hook, dans un dépôt git jetable dont il pilote l'index. Recopier
# les motifs ici prouverait que la copie fonctionne — c'est la tautologie que le
# dépôt a déjà rencontrée en F2, où des tests écrits d'après l'implémentation
# reproduisaient fidèlement l'oubli qu'ils devaient attraper.
#
# Deux familles de cas, et les deux comptent :
#   - **Rejet** (AC-1) : un secret de chaque famille doit faire sortir 1.
#     Sans ces cas, un motif cassé par une faute de frappe passerait inaperçu.
#   - **Acceptation** (AC-2 à AC-4) : contrôles négatifs. Un garde-fou qui
#     refuse tout est aussi inutile qu'un garde-fou qui accepte tout, à ceci
#     près qu'il se fait désactiver plus vite. Ils prouvent que les exclusions,
#     le filtre sur les suppressions et la frontière `sk_test_`/`sk_live_`
#     tiennent.
#
# **Les fixtures sont composées à l'exécution.** Ce dépôt est public : écrire
# `ghp_` suivi de 36 caractères en clair déclencherait la protection de push de
# GitHub, et le garde-fou éprouvé ici bloquerait le fichier qui le prouve. Les
# préfixes sont donc concaténés au moment de l'écriture, si bien qu'aucune
# chaîne complète ressemblant à un secret n'existe littéralement dans le dépôt.
# Le script sous test, lui, voit bien la chaîne entière.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`. Item B2 du plan.
#
# Les marqueurs `# describe` / `# it` ne sont pas décoratifs : la matrice de
# traçabilité les lit comme elle lit un `describe('REQ-…')` dans une spec
# Vitest, et c'est ce qui rattache les critères de l'exigence à leur preuve.
#
# describe REQ-SEC-001 — refus des secrets à haute confiance

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO_ROOT/scripts/secret-guard.sh"
SANDBOX="$(mktemp -d -t verify-secret-guard-XXXXXX)"
FAILURES=0

# Le bac à sable est un dépôt git jetable, jamais le dépôt courant : le garde-fou
# lit `git diff --cached`, donc l'éprouver ici manipulerait l'index de travail de
# celui qui lance la vérification. Un outil de diagnostic qui touche à l'index
# d'un développeur se fait désinstaller à la première mauvaise surprise.
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -f "$GUARD" ] || { echo "ECHEC : $GUARD introuvable" >&2; exit 1; }

git -C "$SANDBOX" init --quiet
git -C "$SANDBOX" config user.email "canary@example.invalid"
git -C "$SANDBOX" config user.name "canary"

# --- Fixtures composées -------------------------------------------------------
#
# Chaque valeur est assemblée depuis un préfixe et un corps inertes. Prises
# séparément, aucune des deux moitiés ne ressemble à un secret ; assemblées,
# elles satisfont exactement le motif que le garde-fou cherche.
PEM_SECRET="-----BE""GIN RSA PRIVATE KEY-----"
JWT_SECRET="ey""J""hbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.c2lnbmF0dXJlLWNhbmFyeS12YWx1ZQ"
AWS_SECRET="AKI""AIOSFODNN7EXAMPLE"
GH_SECRET="ghp""_""0123456789abcdef0123456789abcdef0123"
STRIPE_LIVE="sk""_live_""0123456789abcdefghijklmn"
STRIPE_TEST="sk""_test_""0123456789abcdefghijklmn"

# Écrit un fichier dans le bac à sable, l'ajoute à l'index, lance le garde-fou
# réel depuis ce dépôt, et rend son code de sortie. L'index est vidé ensuite pour
# que chaque cas soit indépendant du précédent — sinon le premier rejet
# masquerait tous les suivants et la vérification annoncerait 5 succès pour un
# seul motif réellement éprouvé.
# Le garde-fou à exécuter est un paramètre et non une constante : c'est ce qui
# permet à la phase 5 de soumettre au MÊME harnais un garde-fou volontairement
# neutralisé, et donc de prouver que le harnais sait distinguer les deux.
run_guard_on() {
  local path="$1" content="$2" guard="${3:-$GUARD}"
  mkdir -p "$SANDBOX/$(dirname "$path")"
  printf '%s\n' "$content" > "$SANDBOX/$path"
  git -C "$SANDBOX" add -A -- "$path"
  local status=0
  ( cd "$SANDBOX" && bash "$guard" >/dev/null 2>&1 ) || status=$?
  git -C "$SANDBOX" reset --quiet
  rm -f "$SANDBOX/$path"
  return "$status"
}

expect_reject() {
  local label="$1" path="$2" content="$3"
  if run_guard_on "$path" "$content"; then
    echo "  ECHEC : $label — le garde-fou a accepté un secret ($path)"
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
    echo "  ECHEC : $label — le garde-fou a refusé un contenu légitime ($path)"
    FAILURES=$((FAILURES + 1))
  fi
}

# it AC-1: chaque famille de secret à haute confiance est refusée
echo "phase 1 — rejet : les cinq familles doivent faire échouer le commit"
expect_reject "clé privée PEM"      "apps/api/src/key.ts"    "const key = \`$PEM_SECRET\`"
expect_reject "JWT"                 "apps/api/src/token.ts"  "const token = '$JWT_SECRET'"
expect_reject "clé d'accès AWS"     "apps/api/src/aws.ts"    "const id = '$AWS_SECRET'"
expect_reject "PAT GitHub"          "apps/web/src/gh.ts"     "const pat = '$GH_SECRET'"
expect_reject "clé Stripe live"     "apps/api/src/pay.ts"    "const sk = '$STRIPE_LIVE'"

# it AC-2: les emplacements où un secret synthétique est légitime restent ouverts
echo "phase 2 — exclusions : un secret synthétique reste permis là où il a un rôle"
expect_accept "spec"                "apps/api/src/a.spec.ts" "const token = '$JWT_SECRET'"
expect_accept "documentation"       "docs/guides/auth.md"    "Exemple : $AWS_SECRET"
expect_accept "workflow CI"         ".github/workflows/x.yml" "value: $GH_SECRET"
expect_accept "scripts"             "scripts/fixture.sh"     "PAT='$GH_SECRET'"

# it AC-3: un contenu ordinaire n'est jamais bloqué
echo "phase 3 — absence de faux positif sur du code ordinaire"
expect_accept "code sans secret"    "apps/web/src/ui.ts"     "export const title = 'Conduit'"
expect_accept "clé Stripe de test"  "apps/api/src/pay2.ts"   "const sk = '$STRIPE_TEST'"

# it AC-4: retirer un secret déjà présent n'est pas bloqué
echo "phase 4 — une suppression de secret passe (le garde-fou encourage le geste)"
printf '%s\n' "const id = '$AWS_SECRET'" > "$SANDBOX/apps/api/src/legacy.ts"
git -C "$SANDBOX" add -A -- "apps/api/src/legacy.ts"
git -C "$SANDBOX" -c commit.gpgsign=false commit --quiet --no-verify -m "fixture" -- "apps/api/src/legacy.ts"
git -C "$SANDBOX" rm --quiet -- "apps/api/src/legacy.ts"
if ( cd "$SANDBOX" && bash "$GUARD" >/dev/null 2>&1 ); then
  echo "  ok : suppression d'un secret — acceptée"
else
  echo "  ECHEC : suppression d'un secret refusée, le garde-fou punit la correction"
  FAILURES=$((FAILURES + 1))
fi
git -C "$SANDBOX" reset --quiet

# it AC-5: la vérification sait elle-même échouer
#
# Contrôle de contrôle. Sans lui, un `run_guard_on` qui rendrait toujours 0 —
# chemin mal construit, `bash` introuvable, `cd` en échec — ferait afficher
# « ok » partout et la vérification entière deviendrait un no-op vert. Le dépôt
# a déjà attrapé un faux « ok » de ce genre sur un grep (item E3).
echo "phase 5 — contrôle négatif : un garde-fou neutralisé doit être détecté"
NEUTERED="$SANDBOX/neutered-guard.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$NEUTERED"
# Le même cas que la phase 1 — un vrai secret AWS dans un chemin non exclu, que
# le garde-fou réel refuse — soumis cette fois à un garde-fou qui sort 0 quoi
# qu'il arrive. Si le harnais rapportait « refusé » ici, c'est qu'il conclut sur
# autre chose que le code de sortie, et toutes les lignes « ok » de la phase 1
# ne prouveraient rien.
if run_guard_on "apps/api/src/canary.ts" "const id = '$AWS_SECRET'" "$NEUTERED"; then
  echo "  ok : le harnais voit bien accepter le garde-fou neutralisé sur un cas que le vrai refuse"
else
  echo "  ECHEC : le harnais ne distingue pas un garde-fou neutralisé d'un garde-fou actif"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le garde-fou de secrets ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: le garde-fou refuse les cinq familles de secrets, respecte ses exclusions et laisse passer une suppression."
