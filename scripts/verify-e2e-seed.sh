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
#
# Il est indexé **par auteur** depuis que le jeu de données porte plusieurs
# comptes : un compteur global ne distinguerait pas « deux comptes semés une
# fois » de « un compte semé deux fois » — soit exactement la propriété que le
# premier contrôle doit trancher.
start_stub() {
  local mode="$1"
  printf '{}\n' > "$STATE_FILE"

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

    // { [author]: nombre darticles créés }. Le fichier est relu à chaque appel
    // plutôt que gardé en mémoire, pour la raison qui vaut déjà ci-dessus.
    const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8").trim() || "{}")
    const writeState = (state) => fs.writeFileSync(stateFile, JSON.stringify(state))

    const readBody = (req) =>
      new Promise((resolve) => {
        let raw = ""
        req.on("data", (chunk) => { raw += chunk })
        req.on("end", () => {
          try { resolve(JSON.parse(raw || "{}")) } catch { resolve({}) }
        })
      })

    // Le stub connaît les comptes **par leur e-mail** pour la connexion, parce
    // que cest la clé que le contrat RealWorld emploie sur `/users/login` là
    // où linscription porte le username.
    const registered = new Map()

    http.createServer(async (req, res) => {
      if (refusing) {
        return json(res, 500, { errors: { server: ["is down"] } })
      }

      const url = new URL(req.url, "http://stub")

      // Inscription : 201 la première fois **pour ce username**, puis 422
      // « déjà pris » — le statut que le contrat RealWorld rend et que le
      // script doit savoir traiter comme un état normal.
      if (req.method === "POST" && url.pathname === "/api/users") {
        const body = await readBody(req)
        const username = body?.user?.username
        if (username && !registered.has(username)) {
          registered.set(username, body.user.email)
          return json(res, 201, { user: { username, token: `stub-token-${username}` } })
        }
        return json(res, 422, { errors: { username: ["has already been taken"] } })
      }

      if (req.method === "POST" && url.pathname === "/api/users/login") {
        const body = await readBody(req)
        const email = body?.user?.email
        const username = [...registered].find(([, mail]) => mail === email)?.[0] ?? "unknown"
        return json(res, 200, { user: { username, token: `stub-token-${username}` } })
      }

      // Liste darticles. Le stub honore le filtre `author` parce que cest
      // exactement la propriété quon veut éprouver : demander « la base
      // contient-elle un article ? » et demander « **mon** article est-il là ? »
      // ne donnent pas la même réponse dès quun autre fichier de specs a créé
      // le sien.
      if (req.method === "GET" && url.pathname === "/api/articles") {
        const author = url.searchParams.get("author")
        if (author) {
          const count = readState()[author] ?? 0
          const list = count > 0 ? [{ slug: `${author}-article` }] : []
          return json(res, 200, { articles: list, articlesCount: count })
        }
        // Flux global : en mode « populated », il porte larticle dun autre.
        const foreign = mode === "populated" ? [{ slug: "someone-elses-article" }] : []
        return json(res, 200, { articles: foreign, articlesCount: foreign.length })
      }

      // Création : incrémente le compteur de lauteur porté par le jeton.
      // Cest lui qui trahirait un doublon.
      if (req.method === "POST" && url.pathname === "/api/articles") {
        await readBody(req)
        const author = String(req.headers.authorization ?? "").replace("Token stub-token-", "")
        const state = readState()
        state[author] = (state[author] ?? 0) + 1
        writeState(state)
        return json(res, 201, { article: { slug: `${author}-article` } })
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
}

# Résumé de l'état du stub : « <comptes semés> <maximum d'articles pour un même
# compte> ».
#
# Le contrôle porte sur ces deux nombres et **jamais sur un total attendu**. Un
# total serait un chiffre à tenir d'accord avec la liste des comptes semés :
# ajouter une entrée dans `e2e-seed.mjs` ferait alors échouer ce fichier avec un
# message parlant d'idempotence, c'est-à-dire du mauvais sujet. « Au moins un
# compte, et aucun compte servi deux fois » est exactement la propriété, et elle
# ne se périme pas.
state_summary() {
  node -e '
    const state = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8").trim() || "{}")
    const counts = Object.values(state)
    // Le saut de ligne final nest pas cosmétique : sans lui, le `read` du
    // shell rend un code non nul sur EOF, et `set -e` arrête le contrôle juste
    // avant son assertion — un faux vert silencieux.
    process.stdout.write(`${counts.length} ${counts.length ? Math.max(...counts) : 0}\n`)
  ' "$STATE_FILE"
}

# describe REQ-CONF-003
# --- Contrôle 1 : deux passages, un seul article par compte ------------------
echo "→ démarrage du stub d'API (mode nominal)..."
start_stub "nominal"

# it AC-2: deux exécutions successives ne produisent ni doublon ni échec
echo "→ premier passage du jeu de données..."
node scripts/e2e-seed.mjs --api-base "http://localhost:${STUB_PORT}/api"

echo "→ second passage du jeu de données..."
node scripts/e2e-seed.mjs --api-base "http://localhost:${STUB_PORT}/api"

read -r seeded most < <(state_summary)
if [ "$seeded" -lt 1 ] || [ "$most" != "1" ]; then
  echo "ÉCHEC: $seeded compte(s) semé(s), jusqu'à $most article(s) pour un même compte —"
  echo "       attendu au moins un compte, et exactement un article chacun."
  echo "       Le jeu de données n'est pas idempotent : un run rejoué doublerait"
  echo "       le flux global, et un test qui compte les articles rougirait sans"
  echo "       qu'aucune ligne du front n'ait bougé."
  exit 1
fi

echo "ok: $seeded compte(s) semé(s), un seul article chacun en deux passages (idempotent)."
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

read -r seeded most < <(state_summary)
if [ "$seeded" -lt 1 ] || [ "$most" != "1" ]; then
  echo "ÉCHEC: $seeded compte(s) semé(s), jusqu'à $most article(s) chacun, alors que le flux"
  echo "       portait déjà celui d'un autre auteur."
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
