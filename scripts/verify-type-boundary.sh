#!/usr/bin/env bash
# Vérifie que la cohérence front/back est bien une DÉPENDANCE DE COMPILATION,
# et pas seulement une intention (REQ-ARCH-001, ADR 001 amendé par ADR 031).
#
# C'est la thèse du dépôt : le **contrat** Conduit est écrit une seule fois dans
# `packages/shared`, donc un changement de contrat doit casser `apps/api` ET
# `apps/web` avant le runtime. Jusqu'ici cette propriété était affirmée dans un
# ADR et dans le README. Une affirmation ne se vérifie pas en la relisant.
#
# Ce script la teste **activement** : il casse volontairement le contrat partagé,
# lance le typecheck, et assert que les DEUX applications refusent de compiler.
# Si une seule tombait, la frontière ne serait typée que d'un côté — situation
# pire que pas de garantie du tout, puisqu'on s'y fierait.
#
# PORTÉE, depuis l'ADR 031 (2026-08-21). `packages/shared` porte le contrat HTTP,
# pas le modèle métier : seuls `apps/web` et `apps/api/src/interface/` ont le
# droit de le connaître. La propriété vérifiée est donc **bidirectionnelle**, et
# c'est ce qui la rend démonstrative :
#
#   - moitié POSITIVE : casser un champ du contrat casse ses consommateurs, et
#     côté API l'erreur cite `src/interface/` ;
#   - moitié NÉGATIVE : ça ne touche NI `src/domain/` NI `src/application/`.
#
# Une thèse qui casse partout ne prouve rien. Avant l'ADR 031, ce script
# constatait que `apps/api` **dans son ensemble** cessait de compiler — un dépôt
# qui aurait correctement isolé son domaine aurait donc échoué à sa propre
# vérification.
#
# Le champ saboté est `favoritesCount` : il est réellement consommé des deux
# côtés (chemin de lecture d'article côté API, aperçu d'article côté web).
# Saboter un champ que seul `shared` utilise prouverait uniquement que `shared`
# compile.
#
# 3 phases :
#   1. État sain      : le typecheck passe sur les trois workspaces
#   2. Contrat cassé  : api ET web échouent ; côté api l'erreur cite interface/
#                       et JAMAIS domain/ ni application/
#   3. Restauration   : le typecheck repasse, aucun résidu
#
# La restauration passe par un `trap EXIT` : une vérification qui laisse le dépôt
# modifié après un échec transforme un diagnostic en incident, et se fait
# désactiver à la première occurrence.
#
# Lancé en pre-push (lefthook) et dans le job CI `Typecheck`. Item F6 du plan.
#
# Les marqueurs `# describe` / `# it` ci-dessous ne sont pas décoratifs : la
# matrice de traçabilité les lit comme elle lit un `describe('REQ-…')` dans une
# spec Vitest. C'est ce qui rattache les critères de l'exigence à la preuve qui
# les établit, alors qu'aucune spec ne les couvre.
#
# describe REQ-ARCH-001 — frontière typée bout-en-bout

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_REL="packages/shared/src/model/article.ts"
MODEL_ABS="$REPO_ROOT/$MODEL_REL"
BACKUP="$(mktemp -t verify-type-boundary-article-XXXXXX.ts)"
TYPECHECK_LOG="$(mktemp -t verify-type-boundary-typecheck-XXXXXX.log)"
LOCK_DIR="${TMPDIR:-/tmp}/verify-type-boundary.lock"

# `mktemp` **crée** le fichier immédiatement, vide. Tester `[ -f "$BACKUP" ]`
# dans le cleanup était donc vrai avant même que la sauvegarde n'existe : un
# signal reçu entre la création du nom et la copie réelle faisait écraser le
# contrat partagé par un fichier de zéro octet — une perte de données sur la
# source de vérité du dépôt, provoquée par la vérification censée la protéger.
# Le drapeau ne passe à `true` qu'après une copie réussie.
BACKUP_READY=false
LOCK_HELD=false

# Champ réellement consommé des deux côtés, et son remplaçant incompatible.
FIELD="favoritesCount"
BROKEN_FIELD="favoritesCountRenamedByVerification"

cleanup() {
  # Le log part **en premier** : le rebuild ci-dessous peut être long, et un
  # `SIGKILL` après le délai de grâce d'un runner tuerait le trap avant la
  # dernière ligne, laissant le fichier orphelin.
  rm -f "$TYPECHECK_LOG"

  if [ "$BACKUP_READY" = true ]; then
    cp "$BACKUP" "$MODEL_ABS"

    # Le `dist/` de `shared` est reconstruit : les deux applications consomment
    # le paquet compilé, pas ses sources. Restaurer la source sans reconstruire
    # laisse des déclarations cassées dans `node_modules`, invisibles dans `git
    # status` puisque `dist/` est ignoré — le pire état dans lequel abandonner
    # une machine, et il a été observé en conditions réelles.
    #
    # L'échec n'est plus avalé. Il ne fait pas échouer le trap — on est peut-être
    # déjà en train de mourir d'un signal — mais il **se voit**, avec la commande
    # exacte pour réparer. Un `|| true` nu rendait les deux cas (pas eu le temps,
    # a échoué) indiscernables et silencieux.
    if ! pnpm --filter @repo/shared build > /dev/null 2>&1; then
      echo "ERREUR: dist/ de @repo/shared non reconstruit — le dépôt peut être cassé" >&2
      echo "        sans que git status ne le montre. Réparer avec :" >&2
      echo "        pnpm --filter @repo/shared build" >&2
    fi
  fi

  rm -f "$BACKUP"
  if [ "$LOCK_HELD" = true ]; then
    rm -rf "$LOCK_DIR"
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"

# `mkdir` est atomique sur POSIX : c'est le verrou le plus simple qui ferme la
# course. Deux exécutions simultanées — un `git push` relancé pendant qu'un
# pre-push tourne encore — muteraient le même fichier en place, et la
# restauration de l'une écraserait le sabotage de l'autre.
#
# L'auto-test de la phase 0 se réinvoque : il saute le verrou, sinon il se
# bloquerait lui-même.
if [ -z "${VERIFY_TYPE_BOUNDARY_FORCE_FAILURE:-}" ]; then
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    # Verrou **périmé** : un run tué par `SIGKILL` n'exécute aucun trap, donc
    # ne libère rien. Sans cette reprise, un seul crash bloquerait tous les
    # pushs suivants et le premier réflexe serait de retirer le verrou du
    # script — c'est-à-dire de supprimer la protection à cause de sa gêne.
    # Le PID écrit dedans permet de distinguer « un autre run travaille » de
    # « un run est mort en route ».
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

if [ ! -f "$MODEL_ABS" ]; then
  echo "ERROR: contrat partagé introuvable : $MODEL_REL" >&2
  exit 1
fi

cp "$MODEL_ABS" "$BACKUP"
BACKUP_READY=true

# Garde-fou : si le champ n'existe plus (renommé légitimement), le script ne doit
# pas passer au vert en ne cassant rien. Il doit dire que sa cible a bougé.
if ! grep -q "  $FIELD:" "$MODEL_ABS"; then
  echo "ERROR: champ '$FIELD' absent de $MODEL_REL — la cible du sabotage a bougé." >&2
  echo "       Choisir un autre champ consommé par apps/api ET apps/web." >&2
  exit 1
fi

# Chemin d'auto-test : sabote puis meurt, pour que l'appelant vérifie que le
# `trap` a bien restauré. Placé après la sauvegarde et avant toute assertion,
# c'est-à-dire exactement là où une interruption réelle serait la plus
# destructrice.
if [ -n "${VERIFY_TYPE_BOUNDARY_FORCE_FAILURE:-}" ]; then
  sed "s/  $FIELD:/  $BROKEN_FIELD:/" "$BACKUP" > "$MODEL_ABS"
  exit 1
fi

# it AC-4: la restauration tient même quand la vérification échoue en cours de route
echo "phase 0 — résilience : un échec en cours de route doit laisser le dépôt intact"
# Le `trap` est le mécanisme qui répond à AC-4, et il n'était éprouvé par rien :
# les phases suivantes ne passent jamais par un chemin d'échec, donc supprimer le
# trap ne faisait rougir aucune assertion. On force donc un vrai échec, dans une
# vraie invocation, sur le vrai fichier.
BOUNDARY_BEFORE="$(cat "$MODEL_ABS")"
VERIFY_TYPE_BOUNDARY_FORCE_FAILURE=1 bash "$0" > /dev/null 2>&1 || true

if [ "$(cat "$MODEL_ABS")" != "$BOUNDARY_BEFORE" ]; then
  echo "ERROR: après un échec en cours de route, le contrat partagé n'a PAS été restauré." >&2
  echo "       Le trap de nettoyage ne tient pas sa promesse (REQ-ARCH-001 AC-4)." >&2
  exit 1
fi
echo "ok phase 0 : le contrat est intact après un échec provoqué."

# it AC-3: le contrat intact laisse compiler les trois workspaces
echo "phase 1 — état sain : le typecheck doit passer"
if ! pnpm typecheck > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le typecheck échoue AVANT le sabotage. Rien à conclure de ce script." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi
echo "ok phase 1 : les trois workspaces compilent."

# it AC-1: un champ renommé fait échouer apps/api ET apps/web
# it AC-2: chaque application cite ses propres fichiers dans l'erreur
echo "phase 2 — contrat cassé : api ET web doivent échouer"
# Renommage du champ dans le schéma partagé. `sed -i ''` est la forme BSD/macOS ;
# la forme GNU s'écrit `sed -i`. On passe par un fichier temporaire pour rester
# portable entre les deux (le runner CI est Linux, le poste de dev macOS).
sed "s/  $FIELD:/  $BROKEN_FIELD:/" "$BACKUP" > "$MODEL_ABS"

if grep -q "  $FIELD:" "$MODEL_ABS"; then
  echo "ERROR: le sabotage n'a pas pris effet — le champ est toujours présent." >&2
  exit 1
fi

# Les applications consomment le paquet **compilé** : sans cette reconstruction,
# elles continueraient de lire les anciennes déclarations et compileraient — le
# script conclurait à l'absence de frontière alors qu'il n'aurait rien cassé.
if ! pnpm --filter @repo/shared build > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le contrat partagé ne compile plus après renommage." >&2
  echo "       Le sabotage doit rester valide en TypeScript pour que le test ait un sens." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi

# Chaque application est interrogée **séparément**, et non par `pnpm typecheck`.
# Turbo arrête l'ordonnancement au premier échec : lancé globalement, il tuerait
# le second workspace (code 130) et le script conclurait « une seule application
# casse » — un faux négatif produit par l'outil, pas par le code.
#
# `|| true` : on ATTEND un échec ici. Sans lui, `set -e` sortirait avant les
# assertions et le script rapporterait un succès pour la mauvaise raison.
assert_fails() {
  local workspace="$1" label="$2"
  local status=0

  pnpm --filter "$workspace" typecheck > "$TYPECHECK_LOG" 2>&1 || status=$?

  if [ "$status" -eq 0 ]; then
    echo "ERROR: $label compile malgré un contrat partagé cassé." >&2
    echo "       La frontière n'est pas une dépendance de compilation de ce côté." >&2
    tail -30 "$TYPECHECK_LOG" >&2
    exit 1
  fi

  # Le code de sortie ne suffit pas : `pnpm` sort aussi en non-zéro sur un script
  # absent ou un module introuvable. On exige une **erreur de type**, seule
  # preuve que c'est bien le compilateur qui a refusé le code.
  #
  # `tsc` émet ses chemins relatifs au workspace (`src/…`), pas depuis la racine
  # du dépôt : chercher `apps/api/src/` ne trouvait rien et faisait conclure à
  # tort que l'application compilait. Le premier écrit de ce script est tombé
  # dans ce piège.
  if ! grep -qE "error TS[0-9]+" "$TYPECHECK_LOG"; then
    echo "ERROR: $label a échoué, mais pas sur une erreur de type." >&2
    echo "       L'échec ne prouve donc rien sur la frontière." >&2
    tail -30 "$TYPECHECK_LOG" >&2
    exit 1
  fi

  local first_error
  first_error="$(grep -m1 -E "error TS[0-9]+" "$TYPECHECK_LOG" | cut -c1-80)"
  echo "  ok $label — $first_error"
}

# it AC-5: la rupture s'arrête à la frontière HTTP de l'API
#
# Les deux assertions ci-dessous lisent le log de `assert_fails "@repo/api"`,
# qui est écrasé au prochain appel. Elles doivent donc rester **entre** les deux
# `assert_fails`, et pas être regroupées plus bas par souci de lisibilité.
assert_cites() {
  local layer="$1"
  if ! grep -qE "^${layer}" "$TYPECHECK_LOG"; then
    echo "ERROR: aucune erreur de apps/api ne cite ${layer}." >&2
    echo "       Le contrat n'est donc plus consommé là où il devrait l'être," >&2
    echo "       ou la vérification a cessé de mesurer ce qu'elle croit mesurer." >&2
    tail -30 "$TYPECHECK_LOG" >&2
    exit 1
  fi
  echo "  ok apps/api casse bien dans ${layer}"
}

assert_untouched() {
  local layer="$1"
  if grep -qE "^${layer}" "$TYPECHECK_LOG"; then
    echo "ERROR: le contrat a fui dans ${layer} (ADR 031)." >&2
    echo "       Renommer un champ du contrat ne doit rien casser sous interface/ :" >&2
    echo "       une couche qui tombe ici en dépend, donc elle le connaît." >&2
    grep -E "^${layer}" "$TYPECHECK_LOG" | head -10 >&2
    exit 1
  fi
  echo "  ok ${layer} ne bouge pas"
}

assert_fails "@repo/api" "apps/api"
assert_cites "src/interface/"
assert_untouched "src/domain/"
assert_untouched "src/application/"

assert_fails "@repo/web" "apps/web"

echo "ok phase 2 : les deux applications échouent, et côté api la rupture s'arrête à interface/."

echo "phase 3 — restauration : le typecheck doit repasser"
cp "$BACKUP" "$MODEL_ABS"
pnpm --filter @repo/shared build > /dev/null 2>&1

if ! pnpm typecheck > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le typecheck échoue APRÈS restauration — le dépôt a été laissé sale." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi
echo "ok phase 3 : contrat restauré, les trois workspaces compilent."

echo "ok: la cohérence front/back est une dépendance de compilation (REQ-ARCH-001, ADR 031)."
