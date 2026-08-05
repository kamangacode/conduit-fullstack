#!/usr/bin/env bash
# Vérifie que la suite de conformité sait **échouer**.
#
# C'est la question que ce dépôt pose à chacun de ses garde-fous, et elle se pose
# ici plus qu'ailleurs : un gate qui ne rougit jamais est indiscernable d'un gate
# qui passe. Si `hurl` était absent, mal invoqué, ou si son code de sortie était
# avalé par un `|| true` glissé dans un pipeline, le job de CI resterait vert sur
# une API entièrement non conforme — et l'affirmation « la suite officielle
# passe » deviendrait précisément le genre de propriété affirmée mais jamais
# observée que la suite est censée éliminer.
#
# On oppose donc à la suite un serveur **stub** qui répond 200 et un corps
# plausible à tout. Il est délibérément « poli » : il ne plante pas, ne coupe pas
# la connexion, et renvoie du JSON bien formé. Un stub qui refuserait les
# connexions prouverait seulement que `hurl` sait détecter un port fermé.
#
# Item F7 du plan d'outillage. Exigence : REQ-CONF-001 AC-2.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SUITE_DIR="apps/api/conformance/hurl"
STUB_PORT="${CONFORMANCE_STUB_PORT:-3998}"

if ! command -v hurl > /dev/null 2>&1; then
  echo "ERREUR: hurl est requis."
  exit 1
fi

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

# describe REQ-CONF-001
node -e '
  const http = require("http")
  // 200 + JSON bien formé sur toute route : le stub le plus favorable possible
  // à un faux vert. Il satisfait la forme de la réponse sans en satisfaire le
  // fond, ce qui est exactement le défaut de conformité qu on veut voir attrapé.
  http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ tags: [], articles: [], articlesCount: 0, comments: [] }))
  }).listen(Number(process.argv[1]))
' "$STUB_PORT" &
stub_pid=$!

for _ in $(seq 1 30); do
  curl -sf "http://localhost:${STUB_PORT}/" > /dev/null 2>&1 && break
  sleep 1
done

if ! curl -sf "http://localhost:${STUB_PORT}/" > /dev/null 2>&1; then
  echo "ERREUR: le serveur stub n'a pas démarré."
  exit 1
fi

# it AC-2: un défaut de conformité fait échouer la suite avec un code non nul
set +e
hurl --test --jobs 1 \
  --variable "host=http://localhost:${STUB_PORT}" \
  --variable "uid=sabotage" \
  "$SUITE_DIR"/*.hurl > /dev/null 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "ÉCHEC: la suite est passée contre un serveur qui répond 200 à tout."
  echo "       Le gate de conformité ne prouve rien — son code de sortie est perdu"
  echo "       quelque part, ou la suite n'a pas réellement été exécutée."
  exit 1
fi

echo "ok: la suite rend un code non nul face à une API non conforme (statut $status)."
