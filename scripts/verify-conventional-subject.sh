#!/usr/bin/env bash
# Met `scripts/check-conventional-subject.sh` en échec, cas par cas
# (REQ-RELEASE-001, ADR 029).
#
# Un verrou de convention de commit partage le défaut de tous les garde-fous du
# dépôt : **il est silencieux quand il marche et silencieux quand il est cassé**.
# Un commit qui passe ne dit pas si la regex a jugé le sujet ou si le hook n'a
# jamais été appelé. Pire ici qu'ailleurs, parce que la sanction d'un verrou
# absent n'arrive pas au moment du commit mais des semaines plus tard, sous la
# forme d'un CHANGELOG incomplet que personne ne relit ligne à ligne.
#
# Ce script exécute donc **le script réel**, jamais une copie de sa regex :
# recopier le motif ici prouverait que la copie fonctionne — la tautologie que le
# dépôt a déjà rencontrée en F2, où des tests écrits d'après l'implémentation
# reproduisaient fidèlement l'oubli qu'ils devaient attraper.
#
# Cinq familles de cas, et les cinq comptent :
#   - **Rejet** (AC-1) : ce qui n'est pas conventionnel doit sortir 1.
#   - **Acceptation** (AC-2) : contrôle négatif. Un verrou qui refuse tout se
#     fait retirer avant la fin de la semaine.
#   - **Dispenses** (AC-3) : les sujets écrits par git. Le cas `Merge …` n'est pas
#     un détail : la rule 15 impose que la promotion `staging → main` soit un
#     merge commit, donc un verrou qui refuse les merges interdit la promotion.
#   - **Historique réel** (AC-4) : le verrou est confronté aux 147 sujets du
#     dépôt, pas à une convention idéalisée.
#   - **Câblage** (AC-5) et **contrôle du contrôle** (AC-6).
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`.
#
# Les marqueurs `# describe` / `# it` ne sont pas décoratifs : la matrice de
# traçabilité les lit comme elle lit un `describe('REQ-…')` dans une spec Vitest.
#
# describe REQ-RELEASE-001 — refus d'un sujet non conventionnel

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO_ROOT/scripts/check-conventional-subject.sh"
SANDBOX="$(mktemp -d -t verify-conventional-subject-XXXXXX)"
FAILURES=0

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -f "$GUARD" ] || { echo "ECHEC : $GUARD introuvable" >&2; exit 1; }

# Soumet un sujet au garde-fou réel et rend son code de sortie. Le garde-fou à
# exécuter est un paramètre et non une constante : c'est ce qui permet à la
# phase 6 de soumettre au MÊME harnais un garde-fou volontairement neutralisé, et
# donc de prouver que le harnais sait distinguer les deux.
run_guard_on() {
  local subject="$1" guard="${2:-$GUARD}"
  local status=0
  bash "$guard" --subject "$subject" >/dev/null 2>&1 || status=$?
  return "$status"
}

expect_reject() {
  local label="$1" subject="$2"
  if run_guard_on "$subject"; then
    echo "  ECHEC : $label — le verrou a accepté « $subject »"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ok : $label — refusé"
  fi
}

expect_accept() {
  local label="$1" subject="$2"
  if run_guard_on "$subject"; then
    echo "  ok : $label — accepté"
  else
    echo "  ECHEC : $label — le verrou a refusé un sujet légitime « $subject »"
    FAILURES=$((FAILURES + 1))
  fi
}

# it AC-1: un sujet qui ne parse pas en Conventional Commit est refusé
echo "phase 1 — rejet : ce qui n'entrerait pas dans le CHANGELOG doit être refusé"
expect_reject "aucun type"              "ajoute le flux des favoris"
expect_reject "type inconnu"            "wip: en cours"
expect_reject "type capitalisé"         "Feat(api): expose le flux"
expect_reject "deux-points manquants"   "feat(api) expose le flux"
expect_reject "description vide"        "feat:"
expect_reject "description absente"     "feat"
expect_reject "espace manquant"         "feat:expose le flux"
expect_reject "scope majuscule"         "feat(API): expose le flux"

# it AC-2: les formes conventionnelles valides passent toutes
#
# Contrôle négatif. Sans lui, un motif cassé par une faute de frappe — donc un
# verrou qui refuse absolument tout — afficherait huit « ok » en phase 1 et
# passerait pour un succès.
echo "phase 2 — acceptation : les formes valides ne doivent jamais être bloquées"
expect_accept "sans scope"              "fix: rejette un slug vide"
expect_accept "avec scope"              "feat(api): expose le flux des favoris"
expect_accept "breaking sans scope"     "refactor!: renomme le contrat"
expect_accept "breaking avec scope"     "refactor(shared)!: renomme ArticleDto"
expect_accept "scope à tiret"           "chore(deps-dev): bump vitest"
expect_accept "scope pointé"            "ci(github.actions): épingle une action"
expect_accept "description à majuscule" "docs: README — parti pris full-stack TS"
expect_accept "sujet long"              "docs(lessons): consigne le test qui flake parce qu'il asserte un entrelacement, et le garde-fou absent en local"

# it AC-3: les sujets écrits par git sont dispensés
#
# Le cas qui compte est `Merge …`. La rule 15 impose que la promotion
# `staging → main` soit un **merge commit, jamais un squash** — sans quoi
# release-please saute la release. Un verrou qui refuserait les merges rendrait
# donc impossible le geste même qu'il protège. Deux merges figurent déjà dans
# l'historique du dépôt : ils sont la preuve que le cas est réel, pas théorique.
echo "phase 3 — dispenses : les sujets générés par git doivent passer"
expect_accept "merge de PR"             "Merge pull request #25 from kamangacode/feat/x"
expect_accept "merge de branche"        "Merge branch 'staging' into main"
expect_accept "revert"                  'Revert "feat(api): expose le flux"'
expect_accept "autosquash fixup"        "fixup! feat(api): expose le flux"
expect_accept "autosquash squash"       "squash! feat(api): expose le flux"

# it AC-4: l'historique réel du dépôt passe le verrou
#
# Un verrou calibré sur une convention idéalisée plutôt que sur des sujets réels
# se découvre le jour où il refuse un geste normal, et il est alors contourné par
# `--no-verify` — donc perdu. La confrontation à l'historique complet est ce qui
# a écarté deux contraintes tentantes : une limite de longueur (une dizaine de
# sujets dépassent 72 caractères) et l'obligation de minuscule initiale (5 sujets
# commencent par un acronyme légitime : « AC-4 assertait… », « PRD Conduit… »).
#
# Une seule exception est attendue, et elle est nommée : un `style:` unique,
# antérieur au verrou. `style` n'appartient pas à la liste close de la rule 03 ;
# le jour où la rule l'ajoutera, ce cas doit disparaître d'ici — sinon la
# vérification passerait en signalant une exception qui n'existe plus.
echo "phase 4 — historique réel : le verrou doit accepter les sujets du dépôt"
EXPECTED_EXCEPTION='^style: '
HISTORY_REJECTED=0
HISTORY_TOTAL=0
while IFS= read -r subject; do
  HISTORY_TOTAL=$((HISTORY_TOTAL + 1))
  if run_guard_on "$subject"; then
    continue
  fi
  if printf '%s' "$subject" | grep -qE "$EXPECTED_EXCEPTION"; then
    echo "  ok : exception connue et documentée — « $subject »"
    continue
  fi
  echo "  ECHEC : sujet de l'historique refusé sans exception prévue — « $subject »"
  HISTORY_REJECTED=$((HISTORY_REJECTED + 1))
done < <(git -C "$REPO_ROOT" log --format='%s')
if [ "$HISTORY_REJECTED" -ne 0 ]; then
  FAILURES=$((FAILURES + HISTORY_REJECTED))
else
  echo "  ok : $HISTORY_TOTAL sujets d'historique confrontés au verrou, aucun refus imprévu"
fi

# it AC-5: le hook local et la CI appellent le même script
#
# C'est la propriété que le choix d'implémentation devait garantir (ADR 029) :
# une seule règle, plusieurs consommateurs. Elle ne se constate pas en lisant le
# script — elle se constate dans le câblage. Si demain quelqu'un recopiait la
# liste des types dans le workflow « pour éviter un appel de script », les deux
# côtés divergeraient au premier ajout de type, et un titre de PR pourrait être
# accepté en CI alors que le même sujet est refusé en local.
echo "phase 5 — câblage : une seule règle, trois consommateurs"
check_wiring() {
  local label="$1" file="$2"
  if [ -f "$REPO_ROOT/$file" ] && grep -q 'check-conventional-subject.sh' "$REPO_ROOT/$file"; then
    echo "  ok : $label appelle le script partagé"
  else
    echo "  ECHEC : $label n'appelle pas scripts/check-conventional-subject.sh"
    FAILURES=$((FAILURES + 1))
  fi
}
check_wiring "le hook commit-msg (lefthook.yml)" "lefthook.yml"
check_wiring "le workflow de titre de PR"        ".github/workflows/pr-title.yml"

# Aucun consommateur ne doit redéclarer la liste des types : ce serait la seconde
# source de vérité que ce dispositif existe pour éviter.
DUPLICATES=0
for consumer in "lefthook.yml" ".github/workflows/pr-title.yml"; do
  if [ -f "$REPO_ROOT/$consumer" ] && grep -qE 'feat\|fix\|docs' "$REPO_ROOT/$consumer"; then
    echo "  ECHEC : $consumer redéclare la liste des types (seconde source de vérité)"
    DUPLICATES=$((DUPLICATES + 1))
  fi
done
if [ "$DUPLICATES" -eq 0 ]; then
  echo "  ok : aucun consommateur ne redéclare la liste des types"
else
  FAILURES=$((FAILURES + DUPLICATES))
fi

# it AC-6: la vérification sait elle-même échouer
#
# Contrôle de contrôle. Sans lui, un `run_guard_on` qui rendrait toujours 0 —
# chemin mal construit, `bash` introuvable — ferait afficher « ok » sur toutes les
# lignes d'acceptation et la vérification entière deviendrait un no-op vert. Le
# dépôt a déjà attrapé un faux « ok » de ce genre sur un grep (item E3).
echo "phase 6 — contrôle négatif : un verrou neutralisé doit être détecté"
NEUTERED="$SANDBOX/neutered-guard.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$NEUTERED"
# Le même cas que la phase 1 — un sujet sans type, que le verrou réel refuse —
# soumis cette fois à un verrou qui sort 0 quoi qu'il arrive. Si le harnais
# rapportait « refusé » ici, c'est qu'il conclut sur autre chose que le code de
# sortie, et toutes les lignes « ok » de la phase 1 ne prouveraient rien.
if run_guard_on "ajoute le flux des favoris" "$NEUTERED"; then
  echo "  ok : le harnais voit bien accepter le verrou neutralisé sur un cas que le vrai refuse"
else
  echo "  ECHEC : le harnais ne distingue pas un verrou neutralisé d'un verrou actif"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le verrou de sujet conventionnel ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: le verrou refuse les sujets non conventionnels, accepte les formes valides et les merges, et la même règle sert le hook et la CI."
