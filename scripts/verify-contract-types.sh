#!/usr/bin/env bash
# Vérifie que le producteur des réponses est réellement LIÉ au contrat partagé,
# et pas seulement annoté comme tel (REQ-ARCH-002 AC-6/AC-7, ADR 026).
#
# C'est la moitié « compilation » de l'item C3. Sa raison d'être tient dans une
# asymétrie mesurée, écrite dans l'ADR 026 :
#
#   - le **compilateur** voit le champ manquant : un littéral auquel il manque
#     un champ du contrat ne compile pas ;
#   - il ne voit **pas** le champ en trop dès qu'il arrive par un spread —
#     `{ ...row }` où `row` est une ligne de persistance plus large que le
#     contrat compile sans broncher.
#
# Le harnais d'intégration (`apps/api/test/contract/`) couvre la seconde moitié.
# Celui-ci couvre la première, et il la couvre **activement** : il retire un
# champ du contrat de la projection réelle et exige que `tsc` refuse. Si le
# typecheck passait, c'est que le chemin de construction se serait décroché du
# contrat quelque part — un `as`, un `any`, une signature perdue — et l'annotation
# `: ArticleSummary` ne serait plus qu'un commentaire.
#
# La cible est `toSummary` dans l'adapter Prisma : la seule projection du dépôt
# par laquelle passent **toutes** les lectures d'articles, liste et détail
# comprises (`toArticle` en dérive). Saboter un helper de test prouverait que le
# test compile ; saboter celle-ci prouve que la production est tenue.
#
# 3 phases :
#   0. Résilience   : un échec en cours de route laisse le dépôt intact (AC-7)
#   1. État sain    : `apps/api` compile avant tout sabotage
#   2. Champ retiré : `apps/api` refuse de compiler, sur une vraie erreur de type
#   3. Restauration : le typecheck repasse, aucun résidu
#
# Lancé en pre-push (lefthook) et dans le job CI `Typecheck`.
#
# Les marqueurs `# describe` / `# it` ci-dessous ne sont pas décoratifs : la
# matrice de traçabilité les lit comme elle lit un `describe('REQ-…')` dans une
# spec Vitest. C'est ce qui rattache ces deux critères à la preuve qui les
# établit, alors qu'aucune spec ne peut les couvrir — un test ne peut pas
# constater un refus de compilation depuis l'intérieur du programme compilé.
#
# describe REQ-ARCH-002 — le producteur de la réponse est lié au contrat

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECTION_REL="apps/api/src/infrastructure/persistence/prisma-article.query.ts"
PROJECTION_ABS="$REPO_ROOT/$PROJECTION_REL"
BACKUP="$(mktemp -t verify-contract-types-projection-XXXXXX.ts)"
TYPECHECK_LOG="$(mktemp -t verify-contract-types-typecheck-XXXXXX.log)"
LOCK_DIR="${TMPDIR:-/tmp}/verify-contract-types.lock"

# `mktemp` crée le fichier immédiatement, vide : tester son existence dans le
# cleanup serait vrai avant même que la sauvegarde n'existe, et un signal reçu
# entre les deux écraserait la projection par un fichier de zéro octet. Le
# drapeau ne passe à `true` qu'après une copie réussie. (Défaut réel rencontré
# sur `verify-type-boundary.sh`, corrigé de la même façon.)
BACKUP_READY=false
LOCK_HELD=false

# Champ du contrat retiré de la projection. `favoritesCount` est un agrégat :
# personne ne peut le reconstituer ailleurs par accident, donc son absence est
# une vraie rupture de contrat et non une valeur qu'un autre chemin fournirait.
FIELD="favoritesCount"

cleanup() {
  rm -f "$TYPECHECK_LOG"

  if [ "$BACKUP_READY" = true ]; then
    cp "$BACKUP" "$PROJECTION_ABS"
  fi

  rm -f "$BACKUP"
  if [ "$LOCK_HELD" = true ]; then
    rm -rf "$LOCK_DIR"
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"

# `mkdir` est atomique sur POSIX : deux exécutions simultanées — un `git push`
# relancé pendant qu'un pre-push tourne encore — muteraient le même fichier en
# place, et la restauration de l'une écraserait le sabotage de l'autre.
#
# L'auto-test de la phase 0 se réinvoque : il saute le verrou, sinon il se
# bloquerait lui-même.
if [ -z "${VERIFY_CONTRACT_TYPES_FORCE_FAILURE:-}" ]; then
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    # Verrou périmé : un run tué par `SIGKILL` n'exécute aucun trap. Sans cette
    # reprise, un seul crash bloquerait tous les pushs suivants, et le premier
    # réflexe serait de retirer le verrou du script — donc de supprimer la
    # protection à cause de sa gêne.
    stale_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [ -n "$stale_pid" ] && kill -0 "$stale_pid" 2>/dev/null; then
      echo "ERROR: une autre exécution de cette vérification est en cours (PID $stale_pid)." >&2
      exit 1
    fi
    echo "note: verrou périmé (PID ${stale_pid:-inconnu} absent) — reprise." >&2
    rm -rf "$LOCK_DIR"
    if ! mkdir "$LOCK_DIR" 2>/dev/null; then
      echo "ERROR: impossible de prendre le verrou : $LOCK_DIR" >&2
      exit 1
    fi
  fi
  echo "$$" > "$LOCK_DIR/pid"
  LOCK_HELD=true
fi

if [ ! -f "$PROJECTION_ABS" ]; then
  echo "ERROR: projection introuvable : $PROJECTION_REL" >&2
  exit 1
fi

cp "$PROJECTION_ABS" "$BACKUP"
BACKUP_READY=true

# Garde-fou : si la cible a bougé (champ renommé, projection déplacée), le script
# ne doit pas passer au vert en ne cassant rien. C'est le mode d'échec le plus
# traître d'une vérification par sabotage — elle rapporte « ok » pour n'avoir
# rien fait.
if ! grep -q "^    $FIELD:" "$PROJECTION_ABS"; then
  echo "ERROR: champ '$FIELD' absent de la projection de $PROJECTION_REL." >&2
  echo "       La cible du sabotage a bougé : choisir un autre champ du contrat," >&2
  echo "       ou corriger ce script si la projection a été déplacée." >&2
  exit 1
fi

# Chemin d'auto-test : sabote puis meurt, pour que l'appelant vérifie que le
# `trap` a bien restauré. Placé après la sauvegarde et avant toute assertion,
# c'est-à-dire là où une interruption réelle serait la plus destructrice.
if [ -n "${VERIFY_CONTRACT_TYPES_FORCE_FAILURE:-}" ]; then
  grep -v "^    $FIELD:" "$BACKUP" > "$PROJECTION_ABS"
  exit 1
fi

# it AC-7: la restauration tient même quand la vérification échoue en cours de route
echo "phase 0 — résilience : un échec en cours de route doit laisser le dépôt intact"
# Le `trap` est le mécanisme qui répond à AC-7, et rien d'autre ne l'éprouve :
# les phases suivantes ne passent jamais par un chemin d'échec, donc supprimer le
# trap ne ferait rougir aucune assertion. On force un vrai échec, dans une vraie
# invocation, sur le vrai fichier.
PROJECTION_BEFORE="$(cat "$PROJECTION_ABS")"
VERIFY_CONTRACT_TYPES_FORCE_FAILURE=1 bash "$0" > /dev/null 2>&1 || true

if [ "$(cat "$PROJECTION_ABS")" != "$PROJECTION_BEFORE" ]; then
  echo "ERROR: après un échec en cours de route, la projection n'a PAS été restaurée." >&2
  echo "       Le trap de nettoyage ne tient pas sa promesse (REQ-ARCH-002 AC-7)." >&2
  exit 1
fi
echo "ok phase 0 : la projection est intacte après un échec provoqué."

echo "phase 1 — état sain : apps/api doit compiler"
if ! pnpm --filter @repo/api typecheck > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le typecheck échoue AVANT le sabotage. Rien à conclure de ce script." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi
echo "ok phase 1 : apps/api compile."

# it AC-6: retirer un champ du contrat de la projection réelle fait échouer le typecheck
echo "phase 2 — champ du contrat retiré : apps/api doit refuser de compiler"
grep -v "^    $FIELD:" "$BACKUP" > "$PROJECTION_ABS"

if grep -q "^    $FIELD:" "$PROJECTION_ABS"; then
  echo "ERROR: le sabotage n'a pas pris effet — le champ est toujours présent." >&2
  exit 1
fi

status=0
pnpm --filter @repo/api typecheck > "$TYPECHECK_LOG" 2>&1 || status=$?

if [ "$status" -eq 0 ]; then
  echo "ERROR: apps/api compile alors que la projection n'écrit plus '$FIELD'." >&2
  echo "       Le producteur de la réponse s'est décroché du contrat partagé :" >&2
  echo "       une assertion de type, un 'any' ou une signature perdue sur le chemin." >&2
  exit 1
fi

# Le code de sortie ne suffit pas : `pnpm` sort aussi en non-zéro sur un script
# absent ou un module introuvable. On exige une **erreur de type**, seule preuve
# que c'est bien le compilateur qui a refusé le code — et qu'elle nomme le champ,
# sans quoi une erreur sans rapport ferait conclure au succès.
if ! grep -qE "error TS[0-9]+" "$TYPECHECK_LOG"; then
  echo "ERROR: apps/api a échoué, mais pas sur une erreur de type." >&2
  echo "       L'échec ne prouve donc rien sur le lien au contrat." >&2
  tail -30 "$TYPECHECK_LOG" >&2
  exit 1
fi

if ! grep -q "$FIELD" "$TYPECHECK_LOG"; then
  echo "ERROR: apps/api a échoué sur une erreur de type qui ne mentionne pas '$FIELD'." >&2
  echo "       Le refus vient d'autre chose que du champ retiré." >&2
  tail -30 "$TYPECHECK_LOG" >&2
  exit 1
fi

echo "  ok $(grep -m1 -E "error TS[0-9]+" "$TYPECHECK_LOG" | cut -c1-100)"
echo "ok phase 2 : le compilateur refuse une projection amputée d'un champ du contrat."

echo "phase 3 — restauration : le typecheck doit repasser"
cp "$BACKUP" "$PROJECTION_ABS"

if ! pnpm --filter @repo/api typecheck > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le typecheck échoue APRÈS restauration — le dépôt a été laissé sale." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi
echo "ok phase 3 : projection restaurée, apps/api compile."

echo "ok: le producteur des réponses est lié au contrat partagé (REQ-ARCH-002)."
