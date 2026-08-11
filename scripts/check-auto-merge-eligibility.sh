#!/usr/bin/env bash
# Décide si une pull request a le droit d'être **armée** en auto-merge
# (REQ-RELEASE-002, ADR 030).
#
# ## Ce que ce script décide, et ce qu'il ne décide pas
#
# Il ne décide **pas** si la CI est verte. Cette question appartient à la
# protection de branche et à l'auto-merge natif de GitHub, qui savent déjà
# attendre les checks requis. Un workflow qui la retrancherait devrait maintenir
# sa propre liste de checks, et se tromperait le jour où un check requis est
# ajouté sans que personne ne pense à l'y recopier — c'est-à-dire qu'il
# fusionnerait une PR dont un contrôle n'a pas encore parlé.
#
# Il décide de la seule question que GitHub ne sait pas trancher : **cette PR
# a-t-elle le droit d'être fusionnée automatiquement, et en squash ?**
#
# ## La règle qui compte : jamais vers `main`
#
# `main` n'est alimenté que par la promotion `staging → main`, et la rule 15
# impose qu'elle soit un **merge commit, jamais un squash** : un squash aplatit
# les N commits conventionnels de `staging` en un seul, et release-please
# (ADR 028), qui dérive le semver de l'historique de `main`, **saute la
# release** — pas de bump, pas de changelog, et `main` diverge en silence.
#
# La rule 15 énonçait cette contrainte comme une consigne : « ne pas poser le
# label `reviewed` sur la PR de promotion ». Une consigne tient jusqu'au jour où
# quelqu'un labellise par habitude, et le symptôme — une release manquante —
# n'apparaît pas au moment du geste. Ce script en fait une **propriété du
# mécanisme** : toute PR visant `main` est refusée, quel que soit son label.
#
# Le critère porte sur la **base**, pas sur le nom de la branche source. Une
# règle écrite sur `head == staging` laisserait passer une PR ouverte vers `main`
# depuis une autre branche ; celle-ci les refuse toutes, ce qui est exactement
# l'invariant voulu — la promotion reste un geste humain.
#
# Usage :
#   check-auto-merge-eligibility.sh --base <ref> --draft <true|false> --label <nom>
#
# Codes de sortie : 0 éligible, 1 refusé (raison nommée), 2 erreur d'usage.

set -euo pipefail

# Le label qui vaut accord humain. Changer cette valeur change le contrat du
# dépôt : elle est reprise telle quelle par `.github/workflows/auto-merge.yml`,
# qui ne la redéclare pas.
REQUIRED_LABEL='reviewed'

# La branche que l'automatisation ne doit jamais alimenter.
PROTECTED_BASE='main'

BASE=''
DRAFT=''
LABEL=''

usage() {
  echo "usage : $(basename "$0") --base <ref> --draft <true|false> --label <nom>" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base)  BASE="${2:-}";  shift 2 || usage ;;
    --draft) DRAFT="${2:-}"; shift 2 || usage ;;
    --label) LABEL="${2:-}"; shift 2 || usage ;;
    *) usage ;;
  esac
done

[ -n "$BASE" ] && [ -n "$DRAFT" ] && [ -n "$LABEL" ] || usage

case "$DRAFT" in
  true|false) ;;
  *) echo "ERREUR : --draft attend true ou false (reçu « $DRAFT »)" >&2; exit 2 ;;
esac

refuse() {
  echo "auto-merge refusé : $1"
  exit 1
}

# 1. Le label. Un autre label n'est pas une erreur — c'est simplement une PR
#    qu'on n'a pas demandé de fusionner.
[ "$LABEL" = "$REQUIRED_LABEL" ] || \
  refuse "label « $LABEL » — seul « $REQUIRED_LABEL » arme l'auto-merge."

# 2. La base. C'est le garde-fou de fond, et il passe avant le brouillon :
#    une promotion en brouillon doit être refusée pour la bonne raison.
[ "$BASE" != "$PROTECTED_BASE" ] || \
  refuse "base « $BASE » — la promotion staging → main se merge à la main, en merge commit (rule 15). Un squash y ferait sauter la release (ADR 028)."

# 3. Le brouillon. GitHub refuse d'armer l'auto-merge sur une PR en brouillon ;
#    le dire ici donne une raison lisible plutôt qu'une erreur d'API.
[ "$DRAFT" != "true" ] || \
  refuse "pull request en brouillon — la sortir du brouillon avant de la labelliser."

echo "auto-merge autorisé : base « $BASE », label « $LABEL », hors brouillon."
