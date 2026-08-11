#!/usr/bin/env bash
# Met `scripts/check-auto-merge-eligibility.sh` en échec, cas par cas
# (REQ-RELEASE-002, ADR 030).
#
# Ce garde-fou a le pire profil de tous ceux du dépôt : **il ne se manifeste
# jamais quand il fonctionne**. Un auto-merge correctement refusé ne produit
# aucun signal — la PR reste simplement ouverte, ce qui ressemble à la normale.
# Et quand il échoue, la sanction n'arrive pas au moment du geste : une promotion
# squashée par erreur ne casse rien tout de suite ; elle fait *sauter une
# release* que personne ne verra manquer avant le prochain changelog.
#
# Un garde-fou muet dans les deux cas ne peut être tenu pour posé que si on l'a
# vu refuser. Ce harnais exécute donc **le script réel** — jamais une copie de sa
# logique, qui ne prouverait que la copie.
#
# Le cas qui justifie tout le dispositif est AC-2 : une PR vers `main` portant le
# label `reviewed`. C'est exactement la situation que la rule 15 confiait à la
# vigilance (« ne pas poser le label sur la PR de promotion »), et c'est celle
# dont le coût est le plus élevé et le plus tardif.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`.
#
# describe REQ-RELEASE-002 — l'auto-merge n'alimente jamais `main`

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO_ROOT/scripts/check-auto-merge-eligibility.sh"
WORKFLOW="$REPO_ROOT/.github/workflows/auto-merge.yml"
FAILURES=0

[ -f "$GUARD" ] || { echo "ECHEC : $GUARD introuvable" >&2; exit 1; }

# Le garde-fou à exécuter est un paramètre et non une constante : c'est ce qui
# permet à la dernière phase de soumettre au MÊME harnais une règle volontairement
# neutralisée, et donc de prouver que le harnais sait distinguer les deux.
run_guard_on() {
  local base="$1" draft="$2" label="$3" guard="${4:-$GUARD}"
  local status=0
  bash "$guard" --base "$base" --draft "$draft" --label "$label" >/dev/null 2>&1 || status=$?
  return "$status"
}

expect_refuse() {
  local label_txt="$1" base="$2" draft="$3" label="$4"
  if run_guard_on "$base" "$draft" "$label"; then
    echo "  ECHEC : $label_txt — la règle a autorisé l'auto-merge"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ok : $label_txt — refusé"
  fi
}

expect_allow() {
  local label_txt="$1" base="$2" draft="$3" label="$4"
  if run_guard_on "$base" "$draft" "$label"; then
    echo "  ok : $label_txt — autorisé"
  else
    echo "  ECHEC : $label_txt — la règle a refusé une PR légitime"
    FAILURES=$((FAILURES + 1))
  fi
}

# it AC-1: une PR de travail labellisée `reviewed` est autorisée
#
# Contrôle négatif, et il vient en premier volontairement : une règle qui refuse
# tout satisferait chacun des cas de refus ci-dessous sans rien garder du tout.
echo "phase 1 — le cas nominal doit passer"
expect_allow "PR vers staging, hors brouillon, label reviewed" "staging" "false" "reviewed"

# it AC-2: une PR vers `main` est refusée, même labellisée `reviewed`
#
# Le cœur du dispositif. `main` n'est alimenté que par la promotion, qui doit
# être un merge commit : un squash aplatirait les commits conventionnels et
# release-please sauterait la release (ADR 028). La rule 15 confiait cela à la
# consigne « ne pas poser le label » ; ici, le label ne suffit plus.
echo "phase 2 — aucune PR vers main n'est armée, quel que soit son label"
expect_refuse "promotion staging → main, label reviewed" "main" "false" "reviewed"
expect_refuse "promotion en brouillon vers main"         "main" "true"  "reviewed"

# it AC-3: le critère porte sur la base, pas sur le nom de la branche source
#
# Une règle écrite sur `head == staging` laisserait passer une PR ouverte vers
# `main` depuis n'importe quelle autre branche. Le script ne reçoit d'ailleurs
# jamais la branche source — c'est la forme la plus sûre de garantir qu'il n'en
# dépend pas.
echo "phase 3 — la base seule décide"
expect_refuse "PR vers main depuis une branche de correctif" "main" "false" "reviewed"
expect_allow  "PR vers staging depuis n'importe quelle branche" "staging" "false" "reviewed"

# it AC-4: un autre label n'arme rien
#
# Ce n'est pas une erreur : la plupart des labels ne demandent aucune fusion. Le
# refus doit rester silencieux et sans conséquence.
echo "phase 4 — seul le label convenu arme l'auto-merge"
expect_refuse "label enhancement"      "staging" "false" "enhancement"
expect_refuse "label reviewed mal cassé" "staging" "false" "Reviewed"
expect_refuse "label vide"             "staging" "false" "none"

# it AC-5: une PR en brouillon est refusée
echo "phase 5 — un brouillon n'est pas prêt à fusionner"
expect_refuse "brouillon vers staging" "staging" "true" "reviewed"

# it AC-6: le workflow appelle la règle partagée et n'en redéclare aucun terme
#
# La propriété que le découpage devait garantir. Elle ne se lit pas dans le
# script — elle se lit dans le câblage. Si quelqu'un remplaçait l'appel par une
# condition `if:` en YAML « pour éviter un checkout », la règle cesserait d'être
# éprouvable, et c'est précisément ce que ce dépôt refuse.
echo "phase 6 — câblage : une seule règle, éprouvable"
if [ -f "$WORKFLOW" ] && grep -q 'check-auto-merge-eligibility.sh' "$WORKFLOW"; then
  echo "  ok : le workflow appelle la règle partagée"
else
  echo "  ECHEC : .github/workflows/auto-merge.yml n'appelle pas la règle partagée"
  FAILURES=$((FAILURES + 1))
fi

# Le workflow ne doit pas retrancher la décision : ni la branche protégée ni le
# label ne se redéclarent chez lui.
if [ -f "$WORKFLOW" ] && grep -qE "base\.ref[[:space:]]*==|contains\(.*labels" "$WORKFLOW"; then
  echo "  ECHEC : le workflow rejuge la base ou le label (seconde source de vérité)"
  FAILURES=$((FAILURES + 1))
else
  echo "  ok : le workflow ne rejuge ni la base ni le label"
fi

# `--auto` distingue « arme » de « fusionne maintenant ». Sans lui, le workflow
# fusionnerait sans attendre les checks requis.
if [ -f "$WORKFLOW" ] && grep -q 'gh pr merge --auto' "$WORKFLOW"; then
  echo "  ok : le workflow arme l'auto-merge natif plutôt que de fusionner"
else
  echo "  ECHEC : le workflow ne passe pas par --auto — il fusionnerait sans attendre les checks"
  FAILURES=$((FAILURES + 1))
fi

# it AC-7: la vérification sait elle-même échouer
#
# Contrôle de contrôle. Sans lui, un `run_guard_on` qui rendrait toujours 1 —
# chemin fautif, `bash` introuvable — ferait afficher « ok » sur toutes les
# lignes de refus, y compris AC-2, et le harnais certifierait un garde-fou
# absent. C'est le mode de panne le plus dangereux ici, parce que le rapport
# vert porterait précisément sur la propriété la plus coûteuse à perdre.
echo "phase 7 — contrôle négatif : une règle neutralisée doit être détectée"
NEUTERED="$(mktemp -t neutered-auto-merge-XXXXXX)"
trap 'rm -f "$NEUTERED"' EXIT
printf '#!/usr/bin/env bash\nexit 0\n' > "$NEUTERED"
# Le cas d'AC-2 — une promotion vers `main` — soumis à une règle qui autorise
# tout. Si le harnais rapportait « refusé » ici, ses « ok » ne prouveraient rien.
if run_guard_on "main" "false" "reviewed" "$NEUTERED"; then
  echo "  ok : le harnais voit bien autoriser la règle neutralisée sur la promotion que la vraie refuse"
else
  echo "  ECHEC : le harnais ne distingue pas une règle neutralisée d'une règle active"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — la règle d'auto-merge ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: l'auto-merge n'est armé que sur une PR de travail labellisée, et jamais vers main."
