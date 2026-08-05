#!/usr/bin/env bash
# Éprouve `check-conformance-drift.sh` en lui soumettant des copies retouchées.
#
# Le mode de panne d'un contrôle de dérive est le même que celui d'un générateur
# de matrice : il ne plante pas, il rend « ok ». Une URL amont qui change, un
# `grep` qui ne matche plus, une comparaison inversée — et le script affiche son
# message vert sur une copie qu'on aurait pu vider de ses assertions. Il
# deviendrait alors pire qu'absent, puisqu'on s'y fierait.
#
# On ne peut pas constater qu'il sait échouer en retouchant les vraies suites. Ce
# script construit donc des **fixtures** : une copie de la suite officielle dans
# un dossier jetable, qu'on abîme d'une façon connue avant de demander son avis
# au contrôle. `CONFORMANCE_DIR` existe pour ça, et seulement pour ça.
#
# Six modes vérifiés, dont deux **contrôles négatifs** (le contrôle doit rester
# vert) : sans eux, un script qui échouerait toujours passerait les autres.
#
# Le sixième porte sur la suite **web** et sur elle seule : ses helpers vivent
# dans un sous-dossier, et un contrôle qui ne comparerait que la racine
# rapporterait « ok » pendant que `helpers/auth.ts` — le fichier qui définit
# comment on s'inscrit et se connecte, donc celui dont la retouche rendrait le
# plus de tests verts d'un coup — aurait été réécrit.
#
# Item F7 du plan d'outillage. Exigences : REQ-CONF-001 AC-3 et AC-4,
# REQ-CONF-002 AC-3.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FIXTURES="$(mktemp -d -t conduit-drift-fixtures-XXXXXX)"

cleanup() {
  rm -rf "$FIXTURES"
}
trap cleanup EXIT INT TERM

failures=0

# Chemins réels d'une suite, par clé. Le script de contrôle porte la même table ;
# la dupliquer ici est assumé — l'alternative serait de la lui demander, donc de
# faire dépendre le vérificateur de ce qu'il vérifie.
suite_root() {
  case "$1" in
    api) echo "apps/api/conformance" ;;
    web) echo "apps/web/conformance" ;;
  esac
}

suite_subdir() {
  case "$1" in
    api) echo "hurl" ;;
    web) echo "e2e" ;;
  esac
}

# Repart d'une copie intacte avant chaque cas : un mode qui hériterait de
# l'avarie du précédent ne prouverait pas ce qu'il annonce.
reset_fixtures() {
  local suite="$1" root subdir
  root="$(suite_root "$suite")"
  subdir="$(suite_subdir "$suite")"

  rm -rf "$FIXTURES/conformance"
  mkdir -p "$FIXTURES/conformance"
  cp -R "$root/$subdir" "$FIXTURES/conformance/$subdir"
  cp "$root/UPSTREAM.md" "$FIXTURES/conformance/UPSTREAM.md"
}

# Exécute le contrôle sur les fixtures et confronte code de sortie ET sortie
# attendue. Le code seul ne suffirait pas : un script qui échouerait pour une
# raison sans rapport (fichier introuvable) donnerait le même 1.
expect_drift() {
  local suite="$1" label="$2" expected_status="$3" expected_pattern="$4"
  local output status

  set +e
  output="$(CONFORMANCE_DIR="$FIXTURES/conformance" bash scripts/check-conformance-drift.sh "$suite" 2>&1)"
  status=$?
  set -e

  if [ "$status" -ne "$expected_status" ]; then
    echo "ÉCHEC [$label] : code de sortie $status, attendu $expected_status"
    printf '%s\n' "$output" | sed 's/^/    /'
    failures=$((failures + 1))
    return
  fi

  if ! printf '%s' "$output" | grep -qE "$expected_pattern"; then
    echo "ÉCHEC [$label] : sortie sans « $expected_pattern »"
    printf '%s\n' "$output" | sed 's/^/    /'
    failures=$((failures + 1))
    return
  fi

  echo "ok  [$label]"
}

if ! curl -sfL --max-time 20 -o /dev/null \
  "https://api.github.com/repos/realworld-apps/realworld"; then
  echo "AVERTISSEMENT: amont injoignable — vérification du contrôle de dérive impossible."
  echo "               (le contrôle lui-même reste non concluant dans ce cas, par construction)"
  exit 0
fi

# describe REQ-CONF-001
# --- Contrôle négatif : une copie intacte doit rester verte ------------------
# En premier, parce que c'est lui qui prouve que les échecs suivants viennent de
# l'avarie et non du dispositif de test.
reset_fixtures api
expect_drift api "copie intacte" 0 "identiques à l'amont"

# it AC-3: une retouche locale de la suite vendorée est détectée et fait échouer le contrôle
# --- Mode 1 : une assertion retouchée ---------------------------------------
# Le cas qui motive tout l'ADR 016 : assouplir la ligne qui dérange.
reset_fixtures api
printf '\n# assertion assouplie localement\n' >> "$FIXTURES/conformance/hurl/tags.hurl"
expect_drift api "fichier retouché" 1 "DÉFAUT.*tags\.hurl"

# --- Mode 2 : un fichier supprimé -------------------------------------------
# Retirer le fichier qui échoue est plus rapide que le corriger, et la suite
# resterait « verte » sur les douze autres.
reset_fixtures api
rm "$FIXTURES/conformance/hurl/errors_auth.hurl"
expect_drift api "fichier supprimé" 1 "manquant en local"

# --- Mode 3 : un fichier ajouté ---------------------------------------------
# Glisser un `.hurl` maison ferait passer pour officielle une assertion écrite
# par nous — l'inverse exact de ce que la suite est censée garantir.
reset_fixtures api
printf 'GET {{host}}/api/tags\nHTTP 200\n' > "$FIXTURES/conformance/hurl/maison.hurl"
expect_drift api "fichier ajouté" 1 "ajouté en local"

# describe REQ-CONF-002
# it AC-3: une retouche d'un fichier imbriqué de la suite e2e est détectée
# --- Mode 4 : un helper imbriqué retouché (suite web) -----------------------
# Le mode qui justifie la comparaison récursive. `helpers/auth.ts` n'est pas un
# fichier parmi d'autres : `register`, `login` et `logout` y sont définis une
# fois et utilisés par toutes les specs. Y remplacer l'attente de navigation par
# une tolérance rendrait vertes des dizaines d'assertions sans qu'un seul
# `.spec.ts` change — la retouche la plus rentable de tout le dossier, et celle
# qu'un contrôle limité à la racine ne verrait jamais.
reset_fixtures web
printf '\n// tolérance ajoutée localement\n' >> "$FIXTURES/conformance/e2e/helpers/auth.ts"
expect_drift web "helper imbriqué retouché" 1 "DÉFAUT.*helpers/auth\.ts"

# describe REQ-CONF-001
# it AC-4: une évolution amont est signalée comme information, sans faire échouer le run
# --- Mode 5 : SHA épinglé dépassé, copie intacte ----------------------------
# Le second contrôle négatif, et le plus important : l'évolution amont est une
# INFORMATION, pas un défaut. Le contrôle doit la signaler **et rester vert**,
# sans quoi rien n'empêcherait la CI de rougir le matin où un tiers publie.
#
# La fixture doit isoler cette situation d'une différence de contenu, sinon les
# deux diagnostics se mélangent et le cas ne prouve plus rien. On télécharge donc
# la suite **au SHA antérieur** : la copie est alors intacte *pour ce SHA*, et
# seul l'écart avec le HEAD subsiste.
#
# Le SHA retenu est le commit qui précède l'épinglé sur ce chemin — le premier
# antérieur qui contienne réellement le dossier. Un SHA pris trop haut dans
# l'historique n'a pas encore `specs/api/hurl`, et le contrôle répond alors
# « amont injoignable » : vrai, mais sans rapport avec ce qu'on veut prouver.
#
# Le SHA est extrait par un vrai parseur JSON et non au `grep` : la réponse de
# l'API porte un `"sha"` par commit, **plus** un par parent et un par arbre. Un
# `grep` en attrape sept pour cinq commits, et le second qu'il rend est le parent
# du premier — un identifiant valide, mais que l'API des contenus ne connaît pas.
# Constaté en écrivant ce cas : il répondait « le dossier n'existe pas encore »
# sur un SHA qui n'était simplement pas un commit.
reset_fixtures api
pinned_sha="$(grep -oE '[0-9a-f]{40}' "$(suite_root api)/UPSTREAM.md" | head -1)"
older_sha="$(curl -sfL --max-time 20 \
  "https://api.github.com/repos/realworld-apps/realworld/commits?path=specs/api/hurl&per_page=5" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const s=JSON.parse(d).map(c=>c.sha).filter(x=>x!==process.argv[1]);console.log(s[0]??"")}catch{console.log("")}})' \
    "$pinned_sha" || true)"

if [ -z "$older_sha" ]; then
  echo "ignoré [SHA dépassé] : aucun commit antérieur trouvé sur ce chemin"
elif ! curl -sfL --max-time 20 -o "$FIXTURES/listing.json" \
  "https://api.github.com/repos/realworld-apps/realworld/contents/specs/api/hurl?ref=$older_sha"; then
  echo "ignoré [SHA dépassé] : le commit antérieur ne porte pas encore le dossier"
else
  rm -f "$FIXTURES/conformance/hurl"/*.hurl
  fetched=0
  for name in $(grep -oE '"name": *"[^"]+\.hurl"' "$FIXTURES/listing.json" | sed -E 's/.*"([^"]+)"/\1/'); do
    curl -sfL --max-time 20 -o "$FIXTURES/conformance/hurl/$name" \
      "https://raw.githubusercontent.com/realworld-apps/realworld/$older_sha/specs/api/hurl/$name" \
      && fetched=$((fetched + 1))
  done
  sed -i.bak "s/[0-9a-f]\{40\}/$older_sha/" "$FIXTURES/conformance/UPSTREAM.md"
  rm -f "$FIXTURES/conformance/UPSTREAM.md.bak"

  if [ "$fetched" -eq 0 ]; then
    echo "ignoré [SHA dépassé] : suite antérieure non récupérable"
  else
    expect_drift api "SHA dépassé, copie intacte" 0 "INFO: le contrat a évolué en amont"
  fi
fi

echo
if [ "$failures" -ne 0 ]; then
  echo "$failures mode(s) de défaillance non constaté(s) : le contrôle de dérive ne protège pas ce qu'il annonce."
  exit 1
fi

echo "ok: le contrôle de dérive distingue la retouche locale de l'évolution amont,"
echo "    et voit les fichiers imbriqués."
