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

cleanup() {
  local status=$?
  for pid in "$web_pid" "$api_pid"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then
      kill "$pid" 2> /dev/null || true
      wait "$pid" 2> /dev/null || true
    fi
  done
  exit "$status"
}
# Deux serveurs à arrêter, et le trap couvre l'interruption autant que l'échec :
# sans lui, un Ctrl-C laisserait deux processus orphelins occuper leurs ports, et
# le run suivant échouerait pour une raison sans rapport avec la conformité.
trap cleanup EXIT INT TERM

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
export NEXT_PUBLIC_API_URL="$API_BASE_URL"

echo "→ build de l'API et du front (URL d'API : $API_BASE_URL)..."
# Par turbo : la tâche `build` déclare `^build` et `db:generate`, donc le graphe
# fournit `@repo/shared` et le client Prisma. Un `pnpm --filter build` direct les
# contournerait — patron qui a cassé la CI deux fois dans ce dépôt.
pnpm exec turbo run build --filter=@repo/api --filter=@repo/web

# describe REQ-CONF-002
# it AC-4: le bundle client servi porte l'URL de l'API de ce run, pas celle par défaut
#
# On vérifie l'**artefact**, pas l'intention. L'`export` ci-dessus peut être juste
# et le bundle faux : c'est exactement ce que produit un cache qui ignore la
# variable, et le symptôme serait alors 128 échecs muets sur la vraie cause. Trois
# lignes ici valent la demi-heure de diagnostic qu'elles évitent.
echo "→ vérification de l'URL d'API figée dans le bundle client..."
if ! grep -rqF "$API_BASE_URL" apps/web/.next/static 2> /dev/null; then
  echo "ERREUR: l'URL « $API_BASE_URL » est absente du bundle client compilé."
  echo "        Le front servi interrogerait une autre API que celle de ce run."
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

echo "→ démarrage du front sur le port ${WEB_PORT}..."
(
  cd apps/web
  NODE_ENV=production \
    NEXT_PUBLIC_API_URL="$API_BASE_URL" \
    pnpm exec next start --port "$WEB_PORT"
) &
web_pid=$!

wait_for "le front" "http://localhost:${WEB_PORT}/" "$web_pid"

# describe REQ-CONF-002
# it AC-1: les 12 fichiers de specs officiels sont exécutés, sans exclusion de notre fait
echo "→ exécution de la suite e2e officielle..."
# `API_BASE` est lu par `conformance/e2e/helpers/config.ts` : les helpers créent
# comptes et articles **par l'API**, sans passer par l'interface. Sans cette
# variable, ils viseraient `https://api.realworld.show/api` — la démo publique —
# et la suite testerait le front de ce dépôt contre les données d'un autre.
cd apps/web
API_BASE="$API_BASE_URL" pnpm exec playwright test
