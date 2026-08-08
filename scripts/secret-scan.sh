#!/usr/bin/env bash
# Détection large de secrets sur une plage de commits, par TruffleHog (REQ-SEC-003).
#
# ## Ce que ce scan ajoute à `secret-guard.sh`
#
# Le garde-fou de B2 est **étroit et bloquant** : cinq familles de motifs à haute
# confiance, refusés en pre-commit. Il ne voit que ce qu'on lui a décrit, et
# seulement dans le diff indexé.
#
# Celui-ci est **large et non bloquant** : 800 détecteurs, entropie, et surtout
# une **vérification en ligne** — TruffleHog appelle le fournisseur pour savoir
# si la clé trouvée est vivante. `--only-verified` ne rapporte donc que des
# secrets réellement utilisables, ce qui rend le signal exploitable là où une
# détection par entropie seule noierait tout le monde sous les faux positifs.
#
# Les deux sont complémentaires, et l'ordre compte : B2 empêche d'écrire, B3
# constate ce qui est passé quand même.
#
# ## Pourquoi un script, et pas l'action GitHub officielle
#
# L'action `trufflesecurity/trufflehog` ferait le travail en six lignes de YAML.
# Elle les ferait **dans le workflow**, c'est-à-dire à un endroit qu'on ne peut
# pas exécuter ailleurs — donc qu'on ne peut pas mettre en échec. C'est
# exactement la correction que B2 a dû faire : la logique du garde-fou vivait en
# ligne dans `lefthook.yml` et n'était éprouvable par rien.
#
# Deux comportements de cette action valent d'être connus, parce qu'ils sont
# repris ici en les rendant visibles plutôt qu'en les subissant :
#
#   - sur un `push` sans commit, elle affiche « No commits to scan » et **sort
#     en 0**. Un job vert peut donc n'avoir rien scanné du tout ;
#   - elle passe toujours `--fail`, si bien que « bloquant ou non » se décide en
#     dehors d'elle, par un `continue-on-error` sur l'étape.
#
# Ce script rend le premier point **explicite** : il calcule sa plage, refuse de
# se déclarer satisfait d'une plage vide, et écrit dans son verdict le nombre de
# commits couverts. Un scan qui n'a rien vu ne doit pas ressembler à un scan qui
# n'a rien trouvé.
#
# **Ce que ce choix coûte, et qui manquait à cet argumentaire.** L'action aurait
# été suivie par l'écosystème `github-actions` de Dependabot, qui l'aurait mise à
# jour toute seule. La version épinglée ci-dessous, elle, est une constante dans
# un fichier shell : aucun écosystème déclaré dans `.github/dependabot.yml` ne la
# voit, et elle ne bougera donc jamais d'elle-même. Un scanner de secrets qui
# vieillit perd exactement ce qui fait sa valeur — les détecteurs ajoutés depuis.
# Dette suivie en [#35](https://github.com/kamangacode/conduit-fullstack/issues/35),
# avec le second symptôme de la même cause : le binaire local et l'image épinglée
# peuvent diverger, donc rendre deux verdicts pour un même commit.
#
# ## Report, pas gate
#
# Ce scan démarre en **rapport** (rule 21, étape 3) : le job CI le porte en
# `continue-on-error`. Le script, lui, rend bien un code non nul quand il trouve
# — c'est la CI qui choisit de ne pas encore en faire un gate, comme pour la
# suite e2e avant #17. Le motif est le même : la vérification en ligne dépend du
# réseau et de l'API d'un tiers, et un gate qui rougit parce qu'un fournisseur
# répond mal est un gate qu'on désactive.
#
# Usage : bash scripts/secret-scan.sh [--include-unverified] <base> <head>
#   base  — commit de départ, exclu. Vide = toute l'histoire jusqu'à head.
#   head  — branche ou commit de fin. Vide = HEAD.
#
# `--include-unverified` rapporte aussi ce que le scanner n'a pas pu confirmer.
# C'est le mode qu'on veut **avant** de pousser, quand on cherche ce qu'on a
# laissé traîner et qu'un faux positif ne coûte qu'un coup d'œil. Ce n'est pas
# une option de test : c'est aussi elle qui permet au canary de constater qu'un
# détecteur tire, puisqu'une clé fabriquée ne peut par nature jamais être
# vérifiée en ligne.

set -euo pipefail

# Version épinglée : un scanner qui suit `latest` change de verdict sans qu'aucun
# commit du dépôt n'ait bougé, et la première conclusion à en tirer serait
# fausse. La mise à jour est un geste daté, comme pour n'importe quelle dépendance.
TRUFFLEHOG_VERSION="3.96.0"
TRUFFLEHOG_IMAGE="ghcr.io/trufflesecurity/trufflehog"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ONLY_VERIFIED=1
if [ "${1:-}" = "--include-unverified" ]; then
  ONLY_VERIFIED=0
  shift
fi

BASE="${1:-}"
HEAD_REF="${2:-HEAD}"

# Deux dorsales pour un seul chemin de code. Le binaire s'il est là — c'est le
# cas d'un poste outillé, et c'est instantané — sinon l'image épinglée, qui est
# ce que tourne la CI. Ce qui compte est que les **arguments** soient les mêmes
# des deux côtés : un script qui en passerait de différents selon la dorsale
# prouverait le comportement de la dorsale, pas celui du scan.
#
# Une seule chose diffère, et elle n'est pas négociable : **l'URL du dépôt**.
# Sous Docker, le dépôt est monté sur `/repo`, et lui passer le chemin de l'hôte
# donnerait un chemin qui n'existe pas dans le conteneur. Le scan échouerait
# alors pour une raison sans rapport avec les secrets — ou pire, sortirait en 0
# sur un dépôt vide. Le point de montage et l'URL sont donc décidés ensemble,
# ici, plutôt que répétés à deux endroits qui divergeront.
if command -v trufflehog > /dev/null 2>&1; then
  BACKEND="binaire"
  REPO_URL="file://$REPO_ROOT"
  BACKEND_LABEL="binaire local ($(trufflehog --version 2>&1 | head -1))"
else
  BACKEND="docker"
  REPO_URL="file:///repo"
  BACKEND_LABEL="image $TRUFFLEHOG_IMAGE:$TRUFFLEHOG_VERSION"
fi

run_trufflehog() {
  if [ "$BACKEND" = "binaire" ]; then
    trufflehog "$@"
  else
    docker run --rm -v "$REPO_ROOT:/repo" -w /repo \
      "$TRUFFLEHOG_IMAGE:$TRUFFLEHOG_VERSION" "$@"
  fi
}

# La plage, calculée ici et affichée, jamais devinée par l'appelant. Un scan dont
# on ne sait pas ce qu'il a couvert ne dit rien, quel que soit son verdict.
if [ -n "$BASE" ]; then
  RANGE_DESC="$BASE..$HEAD_REF"
  COMMIT_COUNT="$(git -C "$REPO_ROOT" rev-list --count "$BASE..$HEAD_REF" 2> /dev/null || echo 0)"
else
  RANGE_DESC="toute l'histoire jusqu'à $HEAD_REF"
  COMMIT_COUNT="$(git -C "$REPO_ROOT" rev-list --count "$HEAD_REF" 2> /dev/null || echo 0)"
fi

echo "Scan de secrets — plage : $RANGE_DESC ($COMMIT_COUNT commit(s))"
echo "Dorsale : $BACKEND_LABEL"

# Le cas qui rend un job vert pour rien. L'action officielle sort 0 ici ; ce
# script sort 1, parce qu'une plage vide sur un événement qui devait en porter
# une est un défaut de câblage, pas une bonne nouvelle.
if [ "$COMMIT_COUNT" -eq 0 ]; then
  echo "ECHEC : la plage est vide — ce scan n'aurait rien examiné." >&2
  echo "        Un scan qui n'a rien vu ne doit pas ressembler à un scan qui n'a rien trouvé." >&2
  exit 1
fi

FINDINGS="$(mktemp -t secret-scan-XXXXXX)"
trap 'rm -f "$FINDINGS"' EXIT

# Les arguments sont assemblés dans un tableau, et `--since-commit` n'est ajouté
# que s'il a une valeur. Le passer vide n'est pas neutre : le scanner reçoit une
# chaîne vide comme point de départ et le comportement dépend alors de sa
# version, ce qui est la dernière chose qu'on veuille d'un outil de sécurité.
#
# `--json` plutôt que la sortie humaine : le verdict se compte, et un `grep` sur
# une mise en forme se casse au premier changement de version du scanner.
# `--no-update` empêche le binaire d'aller chercher une version plus récente au
# milieu d'un run, ce qui annulerait l'épinglage ci-dessus.
# Le mode élargi demande `--results` **explicitement**, et pas seulement
# l'absence de `--only-verified` : par défaut, un constat que le scanner a
# activement infirmé auprès du fournisseur (`unverified`) n'est pas affiché. Une
# clé fabriquée tombe exactement dans ce cas — omettre le drapeau donnait donc un
# rapport vide sur un secret pourtant présent, ce qui est le contraire de ce
# qu'on demande à ce mode.
SCAN_ARGS=(git "$REPO_URL" --branch "$HEAD_REF" --json --no-update)
[ -n "$BASE" ] && SCAN_ARGS+=(--since-commit "$BASE")
if [ "$ONLY_VERIFIED" -eq 1 ]; then
  SCAN_ARGS+=(--only-verified)
else
  SCAN_ARGS+=(--results=verified,unknown,unverified)
fi

STATUS=0
run_trufflehog "${SCAN_ARGS[@]}" > "$FINDINGS" 2> /dev/null || STATUS=$?

# Une ligne JSON par constat. `grep -c` plutôt que `wc -l` : un fichier vide sans
# saut de ligne final compterait 0 dans les deux cas, mais une sortie qui
# contiendrait un avertissement non-JSON gonflerait `wc -l`.
COUNT="$(grep -c '"DetectorName"' "$FINDINGS" 2> /dev/null || true)"
COUNT="${COUNT:-0}"

# Le libellé nomme le mode. « 0 trouvé » ne veut pas dire la même chose selon
# qu'on a filtré sur les secrets vivants ou tout rapporté, et un verdict qui ne
# dit pas dans quel mode il a été rendu se relit de travers six mois plus tard.
if [ "$ONLY_VERIFIED" -eq 1 ]; then
  echo "Secrets vérifiés trouvés : $COUNT"
else
  echo "Constats (mode élargi, vérifiés ou non) : $COUNT"
fi

if [ "$COUNT" -gt 0 ]; then
  echo
  echo "Détecteurs concernés :"
  # Le détecteur et le fichier suffisent à agir. La valeur du secret, elle, n'est
  # jamais réaffichée : la recopier dans un journal de CI public reviendrait à
  # publier ce qu'on vient de trouver.
  grep -o '"DetectorName":"[^"]*"' "$FINDINGS" | sort | uniq -c | sed 's/^/  /'
  echo
  echo "Un secret VÉRIFIÉ est une clé vivante : la révoquer d'abord, la retirer de" >&2
  echo "l'historique ensuite. L'ordre inverse laisse une clé active dans la nature." >&2
  exit 1
fi

if [ "$ONLY_VERIFIED" -eq 1 ]; then
  echo "ok: aucun secret vérifié sur la plage examinée."
else
  echo "ok: aucun constat sur la plage examinée, mode élargi compris."
fi
exit "$STATUS"
