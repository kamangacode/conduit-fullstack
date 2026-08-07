#!/usr/bin/env bash
# Vérifie que le jeu de données e2e est **idempotent** et qu'il sait **échouer**.
#
# Pendant de `verify-e2e-gate.sh` pour l'étape de données. Les deux propriétés
# que REQ-CONF-003 promet sont invisibles dans un run nominal : un seeding qui
# créerait un doublon au second passage passerait inaperçu jusqu'au jour où un
# test compte les articles, et un seeding qui avale son erreur laisserait
# l'absence de données se manifester bien plus loin, sous la forme d'un échec e2e
# parfaitement crédible imputé au front.
#
# Le contrôle oppose donc `scripts/e2e-seed.mjs` à un **stub d'API** plutôt qu'à
# la pile réelle. Ce n'est pas un raccourci : les deux propriétés portent sur la
# séquence d'appels du script, pas sur le comportement de l'API. Le stub les rend
# observables en quelques secondes, là où la vraie pile demanderait Docker, deux
# builds et une base.
#
# Le stub imite le contrat RealWorld au strict nécessaire, y compris le **422 sur
# un compte déjà pris** — le statut exact qui rend le second passage idempotent.
# Un stub qui répondrait 200 partout prouverait seulement que le script sait
# appeler `fetch`.
#
# Exigence : REQ-CONF-003 AC-2 et AC-3.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

STUB_PORT="${E2E_SEED_STUB_PORT:-3198}"
STATE_FILE="$(mktemp)"

stub_pid=""

cleanup() {
  local status=$?
  if [ -n "$stub_pid" ] && kill -0 "$stub_pid" 2> /dev/null; then
    kill "$stub_pid" 2> /dev/null || true
    wait "$stub_pid" 2> /dev/null || true
  fi
  rm -f "$STATE_FILE" "${STATE_FILE}.registered"
  exit "$status"
}
trap cleanup EXIT INT TERM

# Le stub garde son état **sur disque** et non en mémoire : le compteur
# d'articles créés doit survivre à la lecture qu'en fait le shell entre les deux
# passages, et un fichier est le canal le plus simple entre deux processus.
start_stub() {
  local mode="$1"
  printf '0\n' > "$STATE_FILE"

  node -e '
    const http = require("http")
    const fs = require("fs")
    const [port, mode, stateFile] = process.argv.slice(1)

    // `refusing` : tout appel dautorité répond 500. Cest le mode qui éprouve
    // AC-3 — le script doit sortir en code non nul plutôt que de poursuivre.
    const refusing = mode === "refusing"

    const json = (res, status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(payload))
    }

    const articles = () => Number(fs.readFileSync(stateFile, "utf8").trim() || "0")

    http.createServer((req, res) => {
      if (refusing) {
        return json(res, 500, { errors: { server: ["is down"] } })
      }

      const url = new URL(req.url, "http://stub")

      // Inscription : 201 la première fois, puis 422 « déjà pris » — le statut
      // que le contrat RealWorld rend et que le script doit savoir traiter
      // comme un état normal.
      if (req.method === "POST" && url.pathname === "/api/users") {
        if (articles() === 0 && !fs.existsSync(stateFile + ".registered")) {
          fs.writeFileSync(stateFile + ".registered", "1")
          return json(res, 201, { user: { username: "e2e-seed-author", token: "stub-token" } })
        }
        return json(res, 422, { errors: { username: ["has already been taken"] } })
      }

      if (req.method === "POST" && url.pathname === "/api/users/login") {
        return json(res, 200, { user: { username: "e2e-seed-author", token: "stub-token" } })
      }

      // Liste darticles. Le stub honore le filtre `author` parce que cest
      // exactement la propriété quon veut éprouver : demander « la base
      // contient-elle un article ? » et demander « **mon** article est-il là ? »
      // ne donnent pas la même réponse dès quun autre fichier de specs a créé
      // le sien.
      if (req.method === "GET" && url.pathname === "/api/articles") {
        const author = url.searchParams.get("author")
        if (author === "e2e-seed-author") {
          const count = articles()
          const list = count > 0 ? [{ slug: "conformance-baseline-article" }] : []
          return json(res, 200, { articles: list, articlesCount: count })
        }
        // Flux global : en mode « populated », il porte larticle dun autre.
        const foreign = mode === "populated" ? [{ slug: "someone-elses-article" }] : []
        return json(res, 200, { articles: foreign, articlesCount: foreign.length })
      }

      // Création : incrémente le compteur. Cest lui qui trahirait un doublon.
      if (req.method === "POST" && url.pathname === "/api/articles") {
        fs.writeFileSync(stateFile, String(articles() + 1))
        return json(res, 201, { article: { slug: "conformance-baseline-article" } })
      }

      return json(res, 404, { errors: { route: ["not found"] } })
    }).listen(Number(port))
  ' "$STUB_PORT" "$mode" "$STATE_FILE" &
  stub_pid=$!

  for _ in $(seq 1 30); do
    curl -sf "http://localhost:${STUB_PORT}/api/articles" > /dev/null 2>&1 && return 0
    # En mode « refusing » le stub répond 500 à tout : `curl -sf` échoue donc
    # même quand il est prêt. On se contente de constater que le port répond.
    curl -s -o /dev/null "http://localhost:${STUB_PORT}/api/articles" && return 0
    sleep 1
  done

  echo "ERREUR: le stub d'API n'a pas démarré sur le port ${STUB_PORT}."
  return 1
}

stop_stub() {
  if [ -n "$stub_pid" ] && kill -0 "$stub_pid" 2> /dev/null; then
    kill "$stub_pid" 2> /dev/null || true
    wait "$stub_pid" 2> /dev/null || true
  fi
  stub_pid=""
  rm -f "${STATE_FILE}.registered"
}

# describe REQ-CONF-003
# --- Contrôle 1 : deux passages, un seul article -----------------------------
echo "→ démarrage du stub d'API (mode nominal)..."
start_stub "nominal"

# it AC-2: deux exécutions successives ne produisent ni doublon ni échec
echo "→ premier passage du jeu de données..."
node scripts/e2e-seed.mjs --api-base "http://localhost:${STUB_PORT}/api"

echo "→ second passage du jeu de données..."
node scripts/e2e-seed.mjs --api-base "http://localhost:${STUB_PORT}/api"

created="$(cat "$STATE_FILE")"
if [ "$created" != "1" ]; then
  echo "ÉCHEC: $created article(s) créé(s) en deux passages, attendu exactement 1."
  echo "       Le jeu de données n'est pas idempotent : un run rejoué doublerait"
  echo "       le flux global, et un test qui compte les articles rougirait sans"
  echo "       qu'aucune ligne du front n'ait bougé."
  exit 1
fi

echo "ok: un seul article créé en deux passages (idempotent)."
stop_stub

# --- Contrôle 2 : indépendance vis-à-vis des autres fichiers de specs --------
echo "→ démarrage du stub d'API (flux déjà peuplé par un autre auteur)..."
start_stub "populated"

# it AC-4: le jeu de données ne dépend d'aucun article créé par un autre fichier de specs
#
# Le raccourci tentant serait « la base contient-elle au moins un article ? ».
# Il rendrait le seeding **dépendant de l'ordre d'exécution** : vert quand un
# autre fichier de specs a déjà créé le sien, rouge sinon — donc vert ou rouge
# selon la charge de la machine, la suite étant parallélisée. Le contrôle porte
# donc sur les articles du compte de seed, et ce test le prouve : un flux déjà
# peuplé par quelqu'un d'autre ne dispense pas de créer le nôtre.
node scripts/e2e-seed.mjs --api-base "http://localhost:${STUB_PORT}/api"

created="$(cat "$STATE_FILE")"
if [ "$created" != "1" ]; then
  echo "ÉCHEC: $created article(s) créé(s) alors que le flux portait déjà celui d'un autre auteur."
  echo "       Le jeu de données se croit présent dès qu'un article existe, d'où qu'il vienne."
  echo "       Il deviendrait dépendant de l'ordre d'exécution d'une suite parallélisée."
  exit 1
fi

echo "ok: le jeu de données est créé même quand le flux porte l'article d'un autre auteur."
stop_stub

# --- Contrôle 3 : le harnais rougit quand l'API refuse -----------------------
echo "→ démarrage du stub d'API (mode refus)..."
start_stub "refusing"

# it AC-3: la création qui échoue sort en code non nul plutôt que de poursuivre
set +e
node scripts/e2e-seed.mjs --api-base "http://localhost:${STUB_PORT}/api" > /dev/null 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "ÉCHEC: le jeu de données est sorti en 0 alors que l'API refusait tout."
  echo "       Le harnais lancerait la suite sur une base vide, et l'absence de"
  echo "       données passerait pour un défaut du front."
  exit 1
fi

echo "ok: code de sortie non nul quand l'API refuse (statut $status)."
