#!/usr/bin/env bash
# Refuse un commit qui **ajoute** un secret à haute confiance (REQ-SEC-001).
#
# Pourquoi un fichier plutôt que la logique en ligne dans `lefthook.yml` : un
# garde-fou qu'on ne peut pas exécuter hors de son hook ne peut pas être mis en
# échec, donc pas prouvé. Le dépôt a déjà payé cette leçon en F2 — des tests
# écrits d'après l'implémentation reproduisaient l'oubli qu'ils devaient
# attraper, et la parade avait été d'extraire le comportement dans une fonction
# appelée par la production ET par les specs. Même parade ici : `lefthook.yml`
# et `scripts/verify-secret-guard.sh` appellent ce script, jamais une copie de
# ses motifs. Un canary qui recopierait les regex prouverait que la copie
# fonctionne, pas que le hook mord.
#
# **Haute confiance uniquement.** Chaque motif ci-dessous a une forme si
# spécifique qu'une correspondance est presque sûrement un vrai secret. C'est un
# choix assumé contre la détection large (entropie, mots-clés `password=`) :
# ce hook s'exécute à chaque commit, et un garde-fou bruyant se fait contourner
# par `--no-verify` en une semaine. La détection large est le rôle du scan
# TruffleHog en CI (item B3), qui tourne hors du chemin critique et peut donc
# assumer des faux positifs.
#
# Ce script ne cherche que dans les lignes **ajoutées** (`^+` d'un diff `-U0`) :
# un secret déjà présent dans l'historique n'est pas rattrapable par un hook de
# commit, et le signaler à chaque commit suivant rendrait le garde-fou inutile.
# Sa révocation relève du scan d'historique, pas d'ici.
#
# Usage : `bash scripts/secret-guard.sh` dans un dépôt git dont l'index porte
# les fichiers à examiner. Sortie 0 si rien, 1 si un secret est ajouté.
#
# Appelé par le hook pre-commit `secret-guard` (lefthook.yml) et éprouvé par
# `scripts/verify-secret-guard.sh`. Item B2 du plan.

set -euo pipefail

# --- Motifs à haute confiance -------------------------------------------------
#
# Un seul point de définition : le hook et le canary lisent celui-ci. Ajouter un
# motif ici sans ajouter son cas dans le canary fait échouer la vérification,
# qui exige une couverture de chaque motif — c'est voulu.
#
# - PEM  : en-tête de clé privée, toutes variantes (RSA, EC, OPENSSH…).
# - JWT  : trois segments base64url séparés par des points, en-tête `eyJ`.
#          Le seuil de 10 caractères par segment évite `eyJ.a.b` dans une doc.
# - AKIA : identifiant de clé d'accès AWS, préfixe + 16 caractères majuscules.
# - ghp_ : jeton d'accès personnel GitHub, longueur fixe de 36.
# - sk_live_ : clé secrète Stripe en mode production. `sk_test_` est
#              volontairement absent : une clé de test n'est pas un secret, et
#              l'inclure ferait échouer des exemples légitimes.
SECRET_PATTERN='(-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk_live_[A-Za-z0-9]{20,})'

# --- Emplacements exclus ------------------------------------------------------
#
# Endroits où un secret **synthétique** est légitime et attendu : specs, docs,
# workflows CI, configuration des hooks, et ce dossier `scripts/` — qui porte
# précisément le canary dont le travail est de contenir de faux secrets.
#
# Cette liste est la surface d'évasion du garde-fou : y ajouter un chemin, c'est
# accepter qu'un vrai secret puisse y passer. Elle se justifie parce que ces
# emplacements ne portent pas de configuration d'exécution — aucun d'eux n'est
# lu par `apps/api` ou `apps/web` au démarrage.
EXCLUDED_PATHS='\.(spec|test)\.(ts|tsx|js|jsx)$|^docs/|^\.github/|^lefthook\.yml$|^scripts/'

# Fichiers ajoutés ou modifiés dans l'index, moins les emplacements exclus.
# `--diff-filter=AM` écarte les suppressions : retirer un secret ne doit pas
# être bloqué par le garde-fou censé encourager ce geste.
#
# Les chemins sont accumulés dans les **paramètres positionnels** plutôt que
# dans une chaîne réexpansée : un chemin porteur d'une espace se scinderait
# sinon en deux arguments, et `git diff` examinerait deux fichiers inexistants
# — en sortant 0, donc en laissant passer le secret sans rien signaler.
#
# `set --` plutôt qu'un tableau bash ou `mapfile` : macOS livre encore bash 3.2,
# qui ne connaît ni `mapfile` ni `xargs -d`. Un garde-fou qui ne tourne que sur
# le runner Linux est un garde-fou qu'on découvre cassé en CI, jamais avant.
set --
while IFS= read -r f; do
  [ -z "$f" ] && continue
  set -- "$@" "$f"
done <<EOF
$(git diff --cached --name-only --diff-filter=AM | { grep -vE "$EXCLUDED_PATHS" || true; })
EOF

# Rien à examiner : un commit qui ne touche que des emplacements exclus, ou qui
# ne fait que des suppressions, est légitime.
[ "$#" -eq 0 ] && exit 0

# `-U0` : aucune ligne de contexte, donc `^+` ne désigne que des ajouts réels.
# Sans lui, un secret présent dans le contexte d'une modification voisine serait
# lu comme ajouté — un faux positif que rien dans le message ne permettrait de
# comprendre.
found=$(
  git diff --cached -U0 -- "$@" \
    | { grep -E '^\+' || true; } \
    | { grep -Eo "$SECRET_PATTERN" || true; }
)

if [ -n "$found" ]; then
  # On nomme la **famille** du secret, jamais sa valeur : un message d'erreur
  # se retrouve dans les logs de CI, les captures d'écran et les tickets. Le
  # garde-fou qui divulgue ce qu'il protège annule son propre travail.
  echo "ERREUR : secret potentiel détecté dans le diff (clé privée / JWT / AWS / GitHub / Stripe)." >&2
  echo "        Retirez la valeur et utilisez une variable d'environnement." >&2
  echo "        Familles trouvées :" >&2
  printf '%s\n' "$found" | sed -E 's/^(.{12}).*/          \1…/' | sort -u >&2
  exit 1
fi

exit 0
