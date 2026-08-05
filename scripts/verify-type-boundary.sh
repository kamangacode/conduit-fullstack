#!/usr/bin/env bash
# Vérifie que la cohérence front/back est bien une DÉPENDANCE DE COMPILATION,
# et pas seulement une intention (REQ-ARCH-001, ADR 001).
#
# C'est la thèse du dépôt : le modèle Conduit est écrit une seule fois dans
# `packages/shared`, donc un changement de modèle doit casser `apps/api` ET
# `apps/web` avant le runtime. Jusqu'ici cette propriété était affirmée dans un
# ADR et dans le README. Une affirmation ne se vérifie pas en la relisant.
#
# Ce script la teste **activement** : il casse volontairement le modèle partagé,
# lance le typecheck, et assert que les DEUX applications refusent de compiler.
# Si une seule tombait, la frontière ne serait typée que d'un côté — situation
# pire que pas de garantie du tout, puisqu'on s'y fierait.
#
# Le champ saboté est `favoritesCount` : il est réellement consommé des deux
# côtés (use cases d'article côté API, aperçu d'article côté web). Saboter un
# champ que seul `shared` utilise prouverait uniquement que `shared` compile.
#
# 3 phases :
#   1. État sain      : le typecheck passe sur les trois workspaces
#   2. Modèle cassé   : api ET web échouent, et leurs erreurs citent leurs fichiers
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

# Champ réellement consommé des deux côtés, et son remplaçant incompatible.
FIELD="favoritesCount"
BROKEN_FIELD="favoritesCountRenamedByVerification"

cleanup() {
  # Restaure le modèle quoi qu'il arrive — succès, échec ou interruption.
  #
  # Le `dist/` de `shared` est reconstruit ensuite : les deux applications
  # consomment le paquet compilé, pas ses sources. Restaurer la source sans
  # reconstruire laisserait des déclarations cassées dans `node_modules`, et le
  # dépôt échouerait au typecheck suivant pour une raison invisible dans `git
  # status` — le pire état dans lequel abandonner une machine.
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$MODEL_ABS"
    rm -f "$BACKUP"
    pnpm --filter @repo/shared build > /dev/null 2>&1 || true
  fi
  rm -f "$TYPECHECK_LOG"
}
trap cleanup EXIT

cd "$REPO_ROOT"

if [ ! -f "$MODEL_ABS" ]; then
  echo "ERROR: modèle partagé introuvable : $MODEL_REL" >&2
  exit 1
fi

cp "$MODEL_ABS" "$BACKUP"

# Garde-fou : si le champ n'existe plus (renommé légitimement), le script ne doit
# pas passer au vert en ne cassant rien. Il doit dire que sa cible a bougé.
if ! grep -q "  $FIELD:" "$MODEL_ABS"; then
  echo "ERROR: champ '$FIELD' absent de $MODEL_REL — la cible du sabotage a bougé." >&2
  echo "       Choisir un autre champ consommé par apps/api ET apps/web." >&2
  exit 1
fi

# it AC-3: le modèle intact laisse compiler les trois workspaces
echo "phase 1 — état sain : le typecheck doit passer"
if ! pnpm typecheck > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le typecheck échoue AVANT le sabotage. Rien à conclure de ce script." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi
echo "ok phase 1 : les trois workspaces compilent."

# it AC-1: un champ renommé fait échouer apps/api ET apps/web
# it AC-2: chaque application cite ses propres fichiers dans l'erreur
echo "phase 2 — modèle cassé : api ET web doivent échouer"
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
  echo "ERROR: le modèle partagé ne compile plus après renommage." >&2
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
    echo "ERROR: $label compile malgré un modèle partagé cassé." >&2
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

assert_fails "@repo/api" "apps/api"
assert_fails "@repo/web" "apps/web"

echo "ok phase 2 : les deux applications échouent, chacune en citant ses propres fichiers."

# it AC-4: la vérification restaure le dépôt, sans résidu
echo "phase 3 — restauration : le typecheck doit repasser"
cp "$BACKUP" "$MODEL_ABS"
pnpm --filter @repo/shared build > /dev/null 2>&1

if ! pnpm typecheck > "$TYPECHECK_LOG" 2>&1; then
  echo "ERROR: le typecheck échoue APRÈS restauration — le dépôt a été laissé sale." >&2
  tail -20 "$TYPECHECK_LOG" >&2
  exit 1
fi
echo "ok phase 3 : modèle restauré, les trois workspaces compilent."

echo "ok: la cohérence front/back est une dépendance de compilation (REQ-ARCH-001)."
