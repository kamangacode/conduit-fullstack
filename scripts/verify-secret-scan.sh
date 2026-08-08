#!/usr/bin/env bash
# Met `scripts/secret-scan.sh` en échec, mode par mode (REQ-SEC-003).
#
# Un scanner de secrets est le garde-fou le plus facile à croire sur parole : il
# affiche « 0 trouvé » quand il marche, et « 0 trouvé » quand il ne regarde rien.
# Les deux se ressemblent au point qu'un dépôt peut vivre des mois sous une
# protection éteinte — l'action officielle de TruffleHog affiche d'ailleurs « No
# commits to scan » puis sort en **0**.
#
# Ce script n'invente pas de fixture de plage : il **fabrique un dépôt git
# jetable**, y recopie le scan réel, et lui soumet un secret planté. Recopier ici
# la commande `trufflehog` prouverait que la copie fonctionne — la tautologie que
# ce dépôt a déjà rencontrée en F2.
#
# ## Ce que chaque phase établit, et ce qu'elle n'établit pas
#
# Une clé **fabriquée** ne peut par nature jamais être vérifiée en ligne : aucun
# fournisseur ne la reconnaîtra. Le canary ne peut donc pas prouver le mode de
# production (`--only-verified`) par un rejet. Il prouve les deux moitiés qui le
# composent, séparément et sur la même fixture :
#
#   - **le détecteur tire** (AC-1) — mode élargi, le secret planté est vu. C'est
#     ce qui établit que le scan atteint réellement les fichiers de la plage ;
#   - **le filtre filtre** (AC-2) — mode de production, la même clé fabriquée
#     n'est pas rapportée. C'est ce qui rend le signal exploitable : sans ce
#     filtre, chaque fixture, chaque exemple de doc et chaque clé de test
#     entrerait dans le rapport, et le rapport serait abandonné en une semaine.
#
# Aucune des deux ne prouve qu'un secret **vivant** serait rapporté. Rien ne peut
# le prouver sans en committer un, ce qui n'arrivera pas. La limite est écrite
# ici plutôt que découverte le jour où elle compte.
#
# Lancé dans le job CI `secrets`, et **pas** en pre-push, à la différence du
# canary de B2. Celui-ci a besoin du scanner — binaire ou image Docker — et
# bloquer le push de qui n'a ni l'un ni l'autre coûterait plus cher que ce
# contrôle ne rapporte, pour un dispositif qui ne fait que rapporter. Il reste
# lançable à la main : `bash scripts/verify-secret-scan.sh`.
#
# Item B3 du plan.
#
# describe REQ-SEC-003 — détection large de secrets sur une plage de commits

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCAN="$REPO_ROOT/scripts/secret-scan.sh"
SANDBOX="$(mktemp -d -t verify-secret-scan-XXXXXX)"
FAILURES=0

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -f "$SCAN" ] || { echo "ECHEC : $SCAN introuvable" >&2; exit 1; }

# Le secret est composé à l'exécution, comme en B2 : ce dépôt est public, et une
# clé d'accès AWS écrite en clair dans un fichier versionné déclencherait la
# protection de push de GitHub — le canary bloquerait alors le fichier qui le
# prouve. Assemblée, la valeur satisfait exactement le détecteur visé.
#
# La paire n'est **pas** celle de la documentation AWS : `AKIAIOSFODNN7EXAMPLE`
# est connue des scanners, qui la traitent comme un exemple. Fixture fabriquée,
# donc — structurellement valide, et qui n'ouvre rien.
AWS_ID="AKI""AQYX4T5N2ZRJH6WPM"
AWS_SECRET="wJal""rXUtnFEMI/K7MDENG/bPxRfiCYzK9pQ2vLmT"

# La longueur est **la** propriété qui décide, et elle a coûté une heure : le
# détecteur AWS cherche exactement 20 caractères d'identifiant et 40 de secret.
# Une première fixture en faisait 39 — le canary affichait « 0 constat » et
# donnait donc, en vert, l'exacte conclusion inverse de la vérité : « le scan ne
# voit rien » au lieu de « la fixture n'est pas un secret ».
#
# C'est le mode de panne d'un canary : il ne se trompe pas bruyamment, il se
# tait. D'où cette garde — un caractère de trop ou de moins, et la vérification
# s'arrête au lieu de rendre un verdict qui ne porterait sur rien.
if [ "${#AWS_ID}" -ne 20 ] || [ "${#AWS_SECRET}" -ne 40 ]; then
  echo "ECHEC : fixture invalide (id ${#AWS_ID}≠20, secret ${#AWS_SECRET}≠40)." >&2
  echo "        Le détecteur ne tirerait pas, et l'absence de constat ne prouverait rien." >&2
  exit 1
fi

# --- Dépôt jetable ------------------------------------------------------------
#
# Le scan résout sa racine depuis sa propre position : y recopier le script suffit
# à le faire travailler sur le bac à sable, sans lui ajouter un paramètre qui
# n'existerait que pour les tests. Au passage, ça prouve qu'il fonctionne depuis
# n'importe quelle copie de travail.
mkdir -p "$SANDBOX/scripts"
cp "$SCAN" "$SANDBOX/scripts/secret-scan.sh"

git -C "$SANDBOX" init --quiet
git -C "$SANDBOX" config user.email "canary@example.invalid"
git -C "$SANDBOX" config user.name "canary"
git -C "$SANDBOX" add -A
git -C "$SANDBOX" -c commit.gpgsign=false commit --quiet --no-verify -m "socle"
BASE_COMMIT="$(git -C "$SANDBOX" rev-parse HEAD)"

printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' "$AWS_ID" "$AWS_SECRET" \
  > "$SANDBOX/config.txt"
git -C "$SANDBOX" add -A
git -C "$SANDBOX" -c commit.gpgsign=false commit --quiet --no-verify -m "fixture"

# Lance le scan réel dans le bac à sable et rend sa sortie. Le `PATH` est un
# paramètre : la phase 4 s'en sert pour placer un scanner neutralisé devant le
# vrai, et vérifier que le harnais conclut bien sur ce que le scanner rapporte.
run_scan() {
  local path_override="${SCAN_PATH_OVERRIDE:-$PATH}"
  PATH="$path_override" bash "$SANDBOX/scripts/secret-scan.sh" "$@" 2>&1 || true
}

expect_output() {
  local label="$1" expected="$2" output="$3"
  if printf '%s' "$output" | grep -qF -- "$expected"; then
    echo "  ok : $label"
  else
    echo "  ECHEC : $label — « $expected » absent de la sortie :"
    printf '%s\n' "$output" | sed 's/^/         /'
    FAILURES=$((FAILURES + 1))
  fi
}

# it AC-1: le scanner voit un secret planté dans la plage examinée
echo "phase 1 — détection : le secret planté doit être vu en mode élargi"
BROAD="$(run_scan --include-unverified "$BASE_COMMIT" HEAD)"
expect_output "le constat est rapporté" "Constats (mode élargi, vérifiés ou non) : 1" "$BROAD"
expect_output "le détecteur est nommé" "AWS" "$BROAD"

# it AC-2: le mode de production ne rapporte pas une clé fabriquée
#
# Contrôle négatif, et il porte la valeur du dispositif entier. Une clé qui
# n'ouvre rien n'est pas un incident ; la rapporter comme tel noierait les vrais
# constats sous les fixtures et les exemples de documentation.
echo "phase 2 — filtre : la même clé fabriquée ne passe pas en mode vérifié"
VERIFIED="$(run_scan "$BASE_COMMIT" HEAD)"
expect_output "aucun secret vérifié" "Secrets vérifiés trouvés : 0" "$VERIFIED"

# it AC-3: une plage vide est un échec, pas un scan réussi
#
# Le mode de panne le plus coûteux, parce qu'il est vert. Un `base` égal à `head`
# — une re-exécution de job, un `push` sans nouveau commit, un mauvais câblage
# d'événement — et le scan n'examine rien.
echo "phase 3 — plage vide : refusée, jamais rapportée comme un succès"
EMPTY="$(run_scan HEAD HEAD)"
expect_output "la plage vide est signalée" "la plage est vide" "$EMPTY"
expect_output "le motif est nommé" "ne doit pas ressembler à un scan qui n'a rien trouvé" "$EMPTY"

# it AC-4: la vérification sait elle-même échouer
#
# Contrôle du contrôle. Un scanner neutralisé — qui sort 0 sans rien écrire — est
# placé devant le vrai dans le `PATH`. La phase 1 doit alors basculer : si le
# harnais rapportait encore une détection, c'est qu'il conclut sur autre chose
# que la sortie du scanner, et chaque « ok » ci-dessus serait un faux.
echo "phase 4 — contrôle négatif : un scanner neutralisé doit être détecté"
STUB_DIR="$SANDBOX/stub"
mkdir -p "$STUB_DIR"
printf '#!/usr/bin/env bash\nexit 0\n' > "$STUB_DIR/trufflehog"
chmod +x "$STUB_DIR/trufflehog"
NEUTERED="$(SCAN_PATH_OVERRIDE="$STUB_DIR:$PATH" run_scan --include-unverified "$BASE_COMMIT" HEAD)"
expect_output "le harnais voit le scanner neutralisé ne rien rapporter" \
  "Constats (mode élargi, vérifiés ou non) : 0" "$NEUTERED"

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le scan de secrets ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: le scan voit un secret planté, filtre les clés non vérifiées, refuse une plage vide et sait être mis en échec."
