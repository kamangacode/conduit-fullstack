#!/usr/bin/env bash
# Exécute la suite e2e de conformité RealWorld officielle contre la pile réelle.
#
# Ce script orchestre ce qu'aucun outil ne sait orchestrer seul. Un parcours e2e
# traverse quatre processus — navigateur, front, API, base — et Playwright ne
# sait démarrer que le premier. Lui confier le front via `webServer` laisserait
# l'API et la base à la charge de l'appelant, donc la composition à moitié dans
# `playwright.config.ts` et à moitié ici : deux endroits à tenir cohérents, et
# celui qui les oublie obtient une suite qui interroge l'API de développement.
#
# Deux modes, un seul chemin de code, comme `test-integration.sh` et
# `test-conformance.sh` :
#   - **local** : le script démarre le service `postgres-test` du docker-compose ;
#   - **CI** : la base vient d'un service du job, qui pose `E2E_DATABASE_URL`.
#
# Un quatrième processus s'est ajouté depuis : un **terminateur TLS** qui sert
# l'hôte d'API figé par deux fichiers de la suite vendorée et le relaie vers
# l'API de ce run (ADR 019). Sans lui, les `page.route()` de ces fichiers ne
# matchent jamais et leurs 24 tests éprouvent l'API réelle au lieu des pannes
# qu'ils décrivent.
#
# Item F7b du plan d'outillage. Exigence : REQ-CONF-002.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_SERVICE="postgres-test"
PG_USER="${POSTGRES_TEST_USER:-conduit}"
PG_PASSWORD="${POSTGRES_TEST_PASSWORD:-conduit}"
PG_PORT="${POSTGRES_TEST_PORT:-55432}"
# Base dédiée, distincte de `conduit_test` (intégration) et `conduit_conformance`
# (Hurl) : les trois lanes peuvent tourner en parallèle, et chacune veut une base
# vierge que les autres ne vident pas sous ses pieds.
PG_DB="${POSTGRES_E2E_DB:-conduit_e2e}"

# Ports **distincts** de ceux du développement (3000 / 3001), à dessein : la
# suite doit pouvoir tourner pendant qu'une session `pnpm dev` est ouverte, et
# surtout ne jamais s'exécuter par accident contre l'application de
# développement — qui parle, elle, à la base de dev.
WEB_PORT="${E2E_WEB_PORT:-3100}"
API_PORT="${E2E_API_PORT:-3101}"
API_BASE_URL="http://localhost:${API_PORT}/api"

# Hôte figé par deux fichiers de la suite vendorée, et port du terminateur TLS
# qui le sert (ADR 019).
#
# `error-handling.spec.ts` et `user-fetch-errors.spec.ts` écrivent leurs mocks
# sur `https://api.realworld.show/api` en dur, là où les helpers lisent
# `API_BASE`. Un `page.route()` filtrant sur l'URL demandée, ces interceptions ne
# matchent que si le **navigateur** demande cet hôte. On le lui fait demander, et
# Chromium le résout vers le terminateur, qui relaie vers l'API de ce run — donc
# jamais vers la démo publique.
MOCKED_API_HOST="${E2E_MOCKED_API_HOST:-api.realworld.show}"
TLS_PORT="${E2E_TLS_PORT:-3102}"
BROWSER_API_URL="https://${MOCKED_API_HOST}/api"

manages_docker=0

if [ -n "${E2E_DATABASE_URL:-}" ]; then
  echo "→ base e2e fournie par l'environnement (mode CI)."
  DATABASE_URL="$E2E_DATABASE_URL"
else
  if ! command -v docker > /dev/null 2>&1 || ! docker info > /dev/null 2>&1; then
    echo "ERREUR: Docker est requis pour la suite e2e (base isolée)."
    echo "        Démarre Docker, ou fournis E2E_DATABASE_URL."
    exit 1
  fi
  manages_docker=1
  echo "→ démarrage de la base de test ($COMPOSE_SERVICE, profile test)..."
  docker compose --profile test up -d "$COMPOSE_SERVICE"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public"
fi

export DATABASE_URL

# Même garde que les deux autres lanes, et pour la même raison : ce script vide
# le contenu de la base cible. La règle porte sur le **nom** de la base, pas sur
# l'URL entière — un hôte nommé « e2e.interne » ne rend pas jetable la base
# `conduit_prod` qu'il héberge.
TARGET_DB="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
if ! printf '%s' "$TARGET_DB" | grep -q 'e2e'; then
  echo "ERREUR: la base cible « $TARGET_DB » n'a pas « e2e » dans son nom."
  echo "        Refus de lancer une suite qui vide des tables sur une base qui ne s'annonce pas jetable."
  exit 1
fi

api_pid=""
web_pid=""
tls_pid=""
tls_dir=""

# Processus qui écoute sur un port, ou rien.
listening_on() {
  command -v lsof > /dev/null 2>&1 || return 0
  lsof -ti "tcp:$1" -sTCP:LISTEN 2> /dev/null
}

cleanup() {
  local status=$?
  for pid in "$web_pid" "$tls_pid" "$api_pid"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then
      kill "$pid" 2> /dev/null || true
      wait "$pid" 2> /dev/null || true
    fi
  done

  # **Puis les ports, et ce second passage n'est pas une ceinture de sécurité.**
  # `$!` rend le PID du sous-shell, pas celui du serveur qu'il lance : tuer le
  # premier laisse le second vivant, orphelin, et toujours à l'écoute. Un run
  # ultérieur trouvait alors le port occupé, échouait à démarrer **son** front —
  # et la suite s'exécutait contre celui du run précédent, compilé avec une autre
  # URL d'API. Le symptôme était une cascade d'échecs de conformité parfaitement
  # crédibles, sur un artefact qui n'était pas celui qu'on croyait tester.
  for port in "$WEB_PORT" "$TLS_PORT" "$API_PORT"; do
    for pid in $(listening_on "$port"); do
      kill "$pid" 2> /dev/null || true
    done
  done
  # Le certificat jetable ne survit pas au run : le laisser traîner ferait
  # ressembler un artefact de test à une clé oubliée, exactement ce que le
  # garde-fou `secret-guard` cherche.
  [ -n "$tls_dir" ] && rm -rf "$tls_dir"
  exit "$status"
}
# Trois serveurs à arrêter, et le trap couvre l'interruption autant que l'échec :
# sans lui, un Ctrl-C laisserait des processus orphelins occuper leurs ports, et
# le run suivant échouerait pour une raison sans rapport avec la conformité.
trap cleanup EXIT INT TERM

# Aucun port occupé au démarrage — refus explicite plutôt que dégradation
# silencieuse.
#
# Sans ce contrôle, un serveur resté d'un run précédent fait échouer le
# `next start` de celui-ci (EADDRINUSE), mais le port répond quand même : le
# `wait_for` passe, la suite s'exécute, et elle éprouve **le front de l'autre
# run** — compilé avec une autre URL d'API. Le diagnostic obtenu ne parle alors
# de rien de réel. Constaté sur ce dépôt : 45 tests rouges attribués à tort à la
# conformité.
for port_check in "$WEB_PORT:le front" "$API_PORT:l'API" "$TLS_PORT:le terminateur TLS"; do
  port="${port_check%%:*}"
  label="${port_check#*:}"
  if [ -n "$(listening_on "$port")" ]; then
    echo "ERREUR: le port $port ($label) est déjà occupé."
    echo "        Un run précédent a probablement laissé un serveur derrière lui."
    echo "        Libère-le : lsof -ti tcp:$port -sTCP:LISTEN | xargs kill"
    exit 1
  fi
done

if [ "$manages_docker" -eq 1 ]; then
  echo "→ attente de la base..."
  ready=0
  for _ in $(seq 1 60); do
    if docker compose --profile test exec -T "$COMPOSE_SERVICE" \
      pg_isready -U "$PG_USER" -d postgres > /dev/null 2>&1; then
      ready=$((ready + 1))
      # Trois succès consécutifs : `initdb` démarre un serveur temporaire avant
      # le définitif, et un `pg_isready` isolé peut interroger le premier.
      # Défaut réel rencontré sur la lane d'intégration (`artifacts/lessons.md`).
      [ "$ready" -ge 3 ] && break
    else
      ready=0
    fi
    sleep 1
  done
  if [ "$ready" -lt 3 ]; then
    echo "ERREUR: la base de test n'est pas prête après 60 s."
    exit 1
  fi

  docker compose --profile test exec -T "$COMPOSE_SERVICE" \
    psql -U "$PG_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
    || docker compose --profile test exec -T "$COMPOSE_SERVICE" \
      psql -U "$PG_USER" -d postgres -c "CREATE DATABASE ${PG_DB};" > /dev/null
fi

echo "→ application des migrations (prisma migrate deploy)..."
pnpm --filter @repo/api exec prisma migrate deploy

# Base vierge avant de commencer. La suite amont fabrique ses propres comptes,
# mais elle compte aussi des tags globaux et des listes d'articles : un résidu du
# run précédent la ferait échouer sur un chemin sans rapport avec la conformité.
#
# `--url` explicite plutôt que `--schema` : le schéma résout `DATABASE_URL` en
# passant par `apps/api/.env`, et la purge doit frapper la base que ce script a
# choisie, pas celle du poste de développement.
echo "→ base remise à vide..."
pnpm --filter @repo/api exec prisma db execute --url "$DATABASE_URL" --stdin <<< \
  'TRUNCATE TABLE favorites, follows, comments, articles, tags, users RESTART IDENTITY CASCADE;'

# `NEXT_PUBLIC_API_URL` est posé **avant le build** et non avant le démarrage :
# Next l'inline dans le bundle client à la compilation. Le poser seulement au
# `start` produirait un front qui interroge l'URL par défaut, et 128 tests qui
# échouent sur un diagnostic ne parlant pas de conformité.
#
# La variable est déclarée dans `turbo.json` (`build.env`) pour entrer dans la
# clé de cache : sans ça, l'artefact d'un build précédent — construit avec une
# autre URL — serait resservi tel quel (REQ-CONF-002 AC-4).
#
# Sa valeur est l'hôte **que la suite intercepte** et non l'API locale
# (ADR 019) : c'est le navigateur qui la consomme, et deux fichiers de la suite
# n'interceptent que celui-là. Le rendu serveur, lui, garde l'URL directe via
# `SERVER_API_URL` — sans quoi il interrogerait la démo publique.
export NEXT_PUBLIC_API_URL="$BROWSER_API_URL"

echo "→ build de l'API et du front (URL navigateur : $BROWSER_API_URL, URL serveur : $API_BASE_URL)..."
# Par turbo : la tâche `build` déclare `^build` et `db:generate`, donc le graphe
# fournit `@repo/shared` et le client Prisma. Un `pnpm --filter build` direct les
# contournerait — patron qui a cassé la CI deux fois dans ce dépôt.
pnpm exec turbo run build --filter=@repo/api --filter=@repo/web

# describe REQ-CONF-002
# it AC-4: le bundle client servi porte l'URL de l'API de ce run, pas celle par défaut
# it AC-6: le bundle client porte l'hôte que la suite vendorée intercepte
#
# On vérifie l'**artefact**, pas l'intention. L'`export` ci-dessus peut être juste
# et le bundle faux : c'est exactement ce que produit un cache qui ignore la
# variable, et le symptôme serait alors 128 échecs muets sur la vraie cause. Trois
# lignes ici valent la demi-heure de diagnostic qu'elles évitent.
echo "→ vérification de l'URL d'API figée dans le bundle client..."
if ! grep -rqF "$BROWSER_API_URL" apps/web/.next/static 2> /dev/null; then
  echo "ERREUR: l'URL « $BROWSER_API_URL » est absente du bundle client compilé."
  echo "        Le front servi interrogerait une autre API que celle de ce run,"
  echo "        et les mocks des deux fichiers qui figent cet hôte ne matcheraient pas."
  echo "        Cause probable : NEXT_PUBLIC_API_URL absente de turbo.json"
  echo "        (tâche build, clé « env »), donc un artefact de cache resservi."
  exit 1
fi

echo "→ installation du navigateur Playwright (idempotent)..."
pnpm --filter @repo/web exec playwright install chromium

echo "→ démarrage de l'API sur le port ${API_PORT}..."
(
  cd apps/api
  NODE_ENV=production \
    PORT="$API_PORT" \
    DATABASE_URL="$DATABASE_URL" \
    JWT_SECRET="${E2E_JWT_SECRET:-e2e-run-secret-jetable-0123456789abcd}" \
    CORS_ORIGIN="http://localhost:${WEB_PORT}" \
    node dist/main.js
) &
api_pid=$!

wait_for() {
  local label="$1" url="$2" pid="$3"
  echo "→ attente de $label..."
  for _ in $(seq 1 90); do
    if curl -sf "$url" > /dev/null 2>&1; then
      return 0
    fi
    # Si le process est mort, inutile d'attendre : le vrai diagnostic est déjà
    # dans sa sortie, au-dessus.
    if ! kill -0 "$pid" 2> /dev/null; then
      echo "ERREUR: $label s'est arrêté avant d'être prêt (voir sa sortie ci-dessus)."
      return 1
    fi
    sleep 1
  done
  echo "ERREUR: $label ne répond pas après 90 s."
  return 1
}

wait_for "l'API" "${API_BASE_URL}/tags" "$api_pid"

# describe REQ-CONF-003
# it AC-1: au moins un article publié existe avant le lancement de la suite
# it AC-2: le jeu de données est créé par l'API, jamais par un accès direct à la base
# it AC-5: le compte que `social.spec.ts` cible en dur existe et a publié un article
#
# ── Jeu de données minimal supposé par la suite (REQ-CONF-003) ───────────────
#
# Le `TRUNCATE` ci-dessus est nécessaire, et il a un effet de bord que la suite
# amont ne déclare nulle part : un de ses tests lit le flux global **sans le
# mocker** (`user-fetch-errors.spec.ts`, 401 sur `/api/user`) et attend d'y
# trouver un `.article-preview`. En amont, la démo publique en contient depuis
# toujours ; ici la page affiche très correctement « No articles are here... yet.»
# et le test rougit sur un défaut qui n'en est pas un.
#
# **Cette étape ne peut pas se placer juste après la purge** : le jeu de données
# est créé par l'API — jamais par un `INSERT` direct, qui fabriquerait un état
# que l'API n'aurait jamais accepté — et l'API doit donc être debout. D'où sa
# place ici, immédiatement après `wait_for`.
#
# `set -e` fait le reste : le script sort en code non nul si la création échoue,
# plutôt que de lancer la suite sur une base vide et de laisser l'absence de
# données passer pour un défaut du front (AC-3).
echo "→ jeu de données minimal de la suite (via l'API)..."
node scripts/e2e-seed.mjs --api-base "$API_BASE_URL"

# ── Terminateur TLS de l'hôte figé par la suite (ADR 019) ────────────────────
#
# Certificat auto-signé, régénéré à chaque run dans un répertoire temporaire, et
# jamais installé dans un magasin de confiance : seul le navigateur de test
# l'accepte, par `ignoreHTTPSErrors` et par l'épinglage de sa clé publique dans
# `playwright.config.ts`.
echo "→ certificat jetable pour ${MOCKED_API_HOST}..."
tls_dir="$(mktemp -d)"
openssl req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
  -keyout "$tls_dir/key.pem" -out "$tls_dir/cert.pem" \
  -subj "/CN=${MOCKED_API_HOST}" \
  -addext "subjectAltName=DNS:${MOCKED_API_HOST}" > /dev/null 2>&1

# describe REQ-CONF-002
# it AC-8: un contexte fabrique par un test voit la meme API que ceux de la config
#
# Empreinte SHA-256 de la clé publique (SPKI) de ce certificat, en base64.
# `--ignore-certificate-errors-spki-list` la prend telle quelle et la compare au
# certificat présenté ; le navigateur n'accepte donc que **celui-ci**, régénéré
# à chaque run et jamais installé dans un magasin de confiance.
#
# Pourquoi la calculer alors que `playwright.config.ts` pose déjà
# `ignoreHTTPSErrors` : cette option n'est appliquée qu'aux contextes fabriqués
# par la fixture de Playwright. Quatre tests de la suite vendorée créent le leur
# avec `browser.newContext()`, qui n'en hérite pas — et comme la page article
# charge son contenu depuis le navigateur (ADR 020), leurs appels échouaient tous
# en erreur de certificat. La page rendait alors son mode « indisponible » et les
# assertions passaient **parce que** rien n'avait chargé. Un drapeau de lancement
# est porté par le navigateur entier, donc hérité par tout contexte.
#
# `-A` sur l'encodage : sans lui, OpenSSL replierait la sortie et la variable
# porterait un saut de ligne au milieu de l'empreinte.
TLS_SPKI="$(openssl x509 -in "$tls_dir/cert.pem" -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl base64 -A)"
if [ -z "$TLS_SPKI" ]; then
  echo "ERREUR: empreinte SPKI du certificat jetable vide."
  echo "        Les tests qui créent leur propre contexte navigateur verraient"
  echo "        toutes leurs requêtes d'API échouer en erreur de certificat, et"
  echo "        passeraient au vert sur une page qui n'a rien chargé."
  exit 1
fi

echo "→ démarrage du terminateur TLS sur le port ${TLS_PORT}..."
node scripts/e2e-tls-terminator.mjs \
  --port "$TLS_PORT" \
  --upstream "http://localhost:${API_PORT}" \
  --cert "$tls_dir/cert.pem" \
  --key "$tls_dir/key.pem" &
tls_pid=$!

# describe REQ-CONF-002
# it AC-7: l'hôte intercepté par la suite est résolu vers l'API de ce run, jamais vers l'internet
#
# `--resolve` reproduit exactement ce que fera Chromium : le nom d'hôte de la
# suite, résolu vers le terminateur local. Si cette vérification échoue, tout ce
# qui suit interrogerait la démo publique — en la modifiant — et la suite
# éprouverait le front de ce dépôt contre les données de quelqu'un d'autre.
echo "→ vérification du relais TLS vers l'API locale..."
tls_ok=0
for _ in $(seq 1 30); do
  if curl -sfk --resolve "${MOCKED_API_HOST}:${TLS_PORT}:127.0.0.1" \
    "https://${MOCKED_API_HOST}:${TLS_PORT}/api/tags" > /dev/null 2>&1; then
    tls_ok=1
    break
  fi
  if ! kill -0 "$tls_pid" 2> /dev/null; then
    echo "ERREUR: le terminateur TLS s'est arrêté avant d'être prêt."
    exit 1
  fi
  sleep 1
done
if [ "$tls_ok" -ne 1 ]; then
  echo "ERREUR: ${MOCKED_API_HOST} n'est pas relayé vers l'API locale après 30 s."
  echo "        Le navigateur atteindrait la démo publique au lieu de cette API."
  exit 1
fi

echo "→ démarrage du front sur le port ${WEB_PORT}..."
(
  cd apps/web
  # Deux URL, à dessein (ADR 019) : le navigateur consomme celle inlinée au
  # build, le processus de rendu appelle l'API directement — pas de DNS public,
  # pas de TLS, et surtout aucune chance de sortir du poste.
  NODE_ENV=production \
    NEXT_PUBLIC_API_URL="$BROWSER_API_URL" \
    SERVER_API_URL="$API_BASE_URL" \
    pnpm exec next start --port "$WEB_PORT"
) &
web_pid=$!

wait_for "le front" "http://localhost:${WEB_PORT}/" "$web_pid"

# describe REQ-CONF-002
# it AC-1: les 12 fichiers de specs officiels sont exécutés, sans exclusion de notre fait
# it AC-9: les six tests de `social.spec.ts` passent, sans relèvement d'aucun délai
echo "→ exécution de la suite e2e officielle..."
#
# **`API_MODE` n'est volontairement pas posé, donc il vaut `true`.** Le drapeau
# (`conformance/e2e/helpers/config.ts`) ne choisit pas un « mode de test » : il
# choisit **quels tests existent**. À `false`, quatre fichiers entiers
# s'éteignent en tête de fichier (`error-handling`, `user-fetch-errors`,
# `xss-security`, `health`) plus une poignée de tests ailleurs — une exclusion
# de notre fait, que l'AC-1 ci-dessus interdit. Les branches « API mode » que la
# suite prend alors supposent un environnement peuplé ; c'est le seeding
# ci-dessus (REQ-CONF-003) qui le rend vrai, jamais ce drapeau qui le contourne.
#
# `API_BASE` est lu par `conformance/e2e/helpers/config.ts` : les helpers créent
# comptes et articles **par l'API**, sans passer par l'interface. Ils tournent
# dans Node, hors du navigateur, donc hors de portée de la règle de résolution —
# ils visent l'API directement. Sans cette variable, ils viseraient
# `https://api.realworld.show/api` — la démo publique — et la suite testerait le
# front de ce dépôt contre les données d'un autre.
#
# Les arguments reçus sont transmis à Playwright (`bash scripts/test-e2e.sh
# error-handling.spec.ts` pour rejouer un seul fichier). Sans argument, la suite
# entière s'exécute : aucun filtre par défaut, donc aucune exclusion de notre
# fait (AC-1).
cd apps/web
API_BASE="$API_BASE_URL" \
  E2E_MOCKED_API_HOST="$MOCKED_API_HOST" \
  E2E_TLS_PORT="$TLS_PORT" \
  E2E_TLS_SPKI="$TLS_SPKI" \
  pnpm exec playwright test "$@"
