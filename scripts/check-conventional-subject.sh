#!/usr/bin/env bash
# Refuse un sujet de commit — ou un titre de PR — qui n'est pas un Conventional
# Commit (REQ-RELEASE-001, ADR 029).
#
# **Ce fichier est la règle, écrite une fois.** Trois consommateurs l'appellent :
#   - le hook `commit-msg` (lefthook), en `--file` : le message n'entre pas dans
#     l'historique s'il ne parse pas ;
#   - `.github/workflows/pr-title.yml`, en `--subject` : le titre de PR compte
#     autant que les commits, parce qu'un merge en squash **en fait** le sujet du
#     commit qui atterrit sur `staging` ;
#   - `scripts/verify-conventional-subject.sh`, qui le met en échec.
#
# Recopier la regex dans le workflow aurait donné deux sources de vérité pour une
# seule convention, et c'est toujours la copie qui dérive. L'ADR 029 explique
# pourquoi le dépôt n'a pas pris commitlint pour autant : il ne couvre pas le
# titre de PR, et le dépôt a déjà tranché (ADR 024) qu'il ne gagne pas un second
# outil pour une seule règle.
#
# ## Pourquoi ce verrou existe
#
# `release-please` (ADR 028) dérive la version, le CHANGELOG et le tag de
# l'historique conventionnel de `main`. Un sujet non conventionnel n'est donc pas
# une faute de style : il est **invisible** de l'outil de release. Le changement
# part en production sans ligne de changelog et sans effet sur le semver, et rien
# ne le signale — le seul symptôme est un CHANGELOG incomplet que personne ne
# relit ligne à ligne.
#
# ## Ce que le verrou ne fait volontairement pas
#
# Les contraintes écartées l'ont été **sur mesure**, pas par principe (rule 21,
# étape « calibrer avant de gater ») :
#   - **pas de limite de longueur** : les sujets de ce dépôt vont jusqu'à 110
#     caractères et portent leur raison d'être ; une limite à 72 en couperait une
#     dizaine, tous légitimes ;
#   - **pas d'obligation de minuscule initiale** : 5 sujets sur 147 commencent par
#     un acronyme ou un nom propre (« AC-4 assertait… », « PRD Conduit… »,
#     « README — … »). La règle aurait produit 5 faux positifs pour zéro défaut
#     réel attrapé.
#
# Usage :
#   check-conventional-subject.sh --file <chemin>      # message de commit
#   check-conventional-subject.sh --subject <chaîne>   # titre de PR
#
# Codes de sortie : 0 conforme (ou dispensé), 1 refusé, 2 erreur d'usage.

set -euo pipefail

# Liste close, alignée sur la rule 03 (« Conventional Commits obligatoire »).
# L'élargir est un changement de convention : il se fait dans la rule d'abord,
# ici ensuite — jamais l'inverse, sinon la convention devient ce que le script
# tolère plutôt que ce que le dépôt a décidé.
TYPES='feat|fix|docs|refactor|test|chore|perf|ci'

# `type(scope)!: description`. Le scope est facultatif, le `!` de breaking change
# aussi ; la description ne l'est pas — `feat:` tout court passerait un contrôle
# qui ne vérifierait que le préfixe, et ne dirait rien de ce qui a changé.
PATTERN="^(${TYPES})(\([a-z0-9._/-]+\))?!?: .+"

usage() {
  echo "usage : $(basename "$0") --file <chemin> | --subject <chaîne>" >&2
  exit 2
}

[ $# -eq 2 ] || usage

case "$1" in
  --file)
    [ -f "$2" ] || { echo "ERREUR : fichier de message introuvable : $2" >&2; exit 2; }
    # Première ligne non vide et non commentée. `git commit` passe un fichier qui
    # porte ses propres commentaires (`#`), et `--verbose` y ajoute le diff
    # complet après une ligne de ciseaux : lire brutalement la première ligne
    # ferait juger un commentaire au lieu du sujet.
    SUBJECT="$(grep -vE '^[[:space:]]*#' "$2" | grep -vE '^[[:space:]]*$' | head -n 1 || true)"
    ;;
  --subject)
    SUBJECT="$2"
    ;;
  *)
    usage
    ;;
esac

# --- Dispenses ---------------------------------------------------------------
#
# Trois familles de sujets sont écrites par git lui-même et ne peuvent pas être
# conventionnelles. Les refuser rendrait des gestes normaux impossibles.
#
# `Merge …` est le cas qui compte : la rule 15 impose que la promotion
# `staging → main` soit un **merge commit, jamais un squash** — un squash
# aplatirait les commits conventionnels et release-please sauterait la release.
# Un verrou qui refuse les merges interdirait donc la promotion qu'il est censé
# protéger. Deux merges figurent déjà dans l'historique du dépôt.
#
# `Revert "…"` et les marqueurs d'autosquash (`fixup!`, `squash!`, `amend!`) sont
# générés par git : leur forme est imposée, et le message final d'un autosquash
# est celui du commit cible, déjà validé à sa création.
case "$SUBJECT" in
  'Merge '*|'Revert '*|'fixup!'*|'squash!'*|'amend!'*)
    exit 0
    ;;
esac

# Un message vide n'est pas un sujet non conforme : c'est un commit annulé.
# git s'en charge lui-même, et le signaler ici produirait une erreur trompeuse.
[ -n "$SUBJECT" ] || exit 0

if printf '%s' "$SUBJECT" | grep -qE "$PATTERN"; then
  exit 0
fi

cat >&2 <<EOF
ERREUR : sujet non conventionnel — il n'entrerait pas dans le CHANGELOG.

  reçu    : ${SUBJECT}
  attendu : type(scope facultatif)!: description
  types   : $(printf '%s' "$TYPES" | tr '|' ' ')

Exemples valides :
  feat(api): expose le flux d'articles favoris
  fix: rejette un slug vide au lieu de renvoyer 500
  refactor(shared)!: renomme ArticleDto en Article

Un sujet non conventionnel est invisible de release-please (ADR 028) : pas de
ligne de changelog, aucun effet sur la version. Voir REQ-RELEASE-001.
EOF
exit 1
