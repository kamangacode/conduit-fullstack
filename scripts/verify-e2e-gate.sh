#!/usr/bin/env bash
# Vérifie que la suite e2e sait **échouer**, et qu'elle exécute réellement des tests.
#
# Pendant de `verify-conformance-gate.sh`, avec un mode de panne supplémentaire
# qui lui est propre. Côté Hurl, la suite reçoit une liste de fichiers en
# argument : si elle est vide, `hurl` proteste. Playwright, lui, **découvre** ses
# tests à partir d'un `testDir`. Un `testDir` erroné, une extension qui ne matche
# pas, une configuration chargée depuis le mauvais dossier — et la commande sort
# en 0 avec « 0 tests ». Vert, silencieux, et totalement creux.
#
# C'est le mode d'échec le plus probable de cet item, parce qu'il ne ressemble pas
# à une panne. Les deux contrôles ci-dessous le ferment par les deux bouts :
#
#   1. **le harnais collecte des tests** — on demande à Playwright de lister ce
#      qu'il exécuterait, et on exige un compte non nul ;
#   2. **le harnais rougit sur un front faux** — on lui oppose un serveur qui
#      répond 200 et du HTML valide à tout, et on exige un code non nul.
#
# Le stub est délibérément « poli » : il ne plante pas, ne coupe pas la connexion,
# et sert un document bien formé. Un stub qui refuserait les connexions prouverait
# seulement que Playwright sait détecter un port fermé — ce dont personne ne
# doute. Ce qu'on veut voir attrapé, c'est une page qui a l'air d'une application
# sans en être une.
#
# Item F7b du plan d'outillage. Exigence : REQ-CONF-002 AC-2.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

STUB_PORT="${E2E_STUB_PORT:-3199}"

stub_pid=""

cleanup() {
  local status=$?
  if [ -n "$stub_pid" ] && kill -0 "$stub_pid" 2> /dev/null; then
    kill "$stub_pid" 2> /dev/null || true
    wait "$stub_pid" 2> /dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

# describe REQ-CONF-002
# --- Contrôle 1 : le harnais collecte bien des tests -------------------------
# `--list` n'ouvre aucun navigateur et ne démarre rien : il ne répond qu'à la
# question « que trouverais-tu ? ». Zéro test trouvé et zéro test échoué sont la
# même sortie une fois le run terminé ; ici, ils sont distincts.
echo "→ collecte des tests par Playwright..."
collected="$(cd apps/web && pnpm exec playwright test --list 2>&1 || true)"
count="$(printf '%s' "$collected" | grep -cE '^\s+\[chromium\]' || true)"

if [ "${count:-0}" -lt 1 ]; then
  echo "ÉCHEC: Playwright n'a collecté aucun test."
  echo "       Un run dans cet état sortirait en 0 sans rien avoir exécuté — le"
  echo "       vert le plus creux qu'un dépôt puisse afficher. Vérifier le"
  echo "       « testDir » de apps/web/playwright.config.ts."
  printf '%s\n' "$collected" | tail -10 | sed 's/^/    /'
  exit 1
fi

echo "ok: $count tests collectés depuis la suite vendorée."

# --- Contrôle 2 : le harnais rougit face à un front non conforme -------------
echo "→ démarrage du front stub sur le port ${STUB_PORT}..."
node -e '
  const http = require("http")
  // 200 + HTML valide sur toute route. Le stub satisfait la forme (un document
  // qui se charge, un titre, un corps) sans satisfaire le fond : ni navbar, ni
  // formulaire, ni interface de débogage. Cest exactement le profil dun front
  // non conforme, par opposition à un front en panne.
  http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end("<!doctype html><html><head><title>Conduit</title></head><body></body></html>")
  }).listen(Number(process.argv[1]))
' "$STUB_PORT" &
stub_pid=$!

for _ in $(seq 1 30); do
  curl -sf "http://localhost:${STUB_PORT}/" > /dev/null 2>&1 && break
  sleep 1
done

if ! curl -sf "http://localhost:${STUB_PORT}/" > /dev/null 2>&1; then
  echo "ERREUR: le front stub n'a pas démarré."
  exit 1
fi

# it AC-2: un front non conforme fait échouer la suite avec un code non nul
#
# `health.spec.ts` suffit et rien de plus n'est utile : c'est le fichier amont
# qui vérifie les fondations (la marque, la navigation, les pages de connexion et
# d'inscription). Lancer les 128 tests contre un stub coûterait plusieurs minutes
# de timeouts pour arriver à la même conclusion.
#
# `--retries=0` : la configuration amont en demande 2 en CI, ce qui triplerait la
# durée d'un échec dont on sait déjà qu'il est certain.
echo "→ exécution de health.spec.ts contre le stub..."
set +e
(
  cd apps/web
  E2E_WEB_PORT="$STUB_PORT" pnpm exec playwright test health.spec.ts \
    --retries=0 --reporter=list
) > /dev/null 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "ÉCHEC: la suite est passée contre un front qui sert une page vide."
  echo "       Le contrôle e2e ne prouve rien — son code de sortie est perdu"
  echo "       quelque part, ou aucun test n'a réellement été exécuté."
  exit 1
fi

echo "ok: la suite rend un code non nul face à un front non conforme (statut $status)."
