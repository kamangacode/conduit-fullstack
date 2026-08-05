#!/usr/bin/env bash
# Exécute la suite de conformité RealWorld officielle contre `apps/api`.
#
# C'est le seul contrôle du dépôt dont les assertions ne viennent pas de nous
# (ADR 016). Les autres suites prouvent que le code fait ce que nous avons dit ;
# celle-ci prouve qu'il fait ce que la spec dit — et l'écart entre les deux
# valait 29 assertions à sa première exécution, sur des chemins que toutes nos
# suites déclaraient couverts.
#
# Deux modes, un seul chemin de code, comme `test-integration.sh` :
#   - **local** : le script démarre le service `postgres-test` du docker-compose
#     (profile `test`, tmpfs) et construit l'URL lui-même ;
#   - **CI** : la base est fournie par un service du job, qui pose
#     `CONFORMANCE_DATABASE_URL`.
#
# La suite tourne contre l'artefact **compilé** (`dist/main.js`), pas contre les
# sources via ts-node : la conformité porte sur ce qui est déployé. Un écart
# introduit par la compilation (chemins d'alias non réécrits, décorateurs perdus)
# ne se verrait sur aucune autre lane.
#
# Item F7 du plan d'outillage. Exigence : REQ-CONF-001.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SUITE_DIR="apps/api/conformance/hurl"
COMPOSE_SERVICE="postgres-test"
PG_USER="${POSTGRES_TEST_USER:-conduit}"
PG_PASSWORD="${POSTGRES_TEST_PASSWORD:-conduit}"
PG_PORT="${POSTGRES_TEST_PORT:-55432}"
# Base **dédiée**, distincte de celle de la lane d'intégration : les deux
# peuvent tourner en parallèle, et la suite officielle exige une base vierge
# (REQ-CONF-001) que la lane d'intégration purge entre chaque test.
PG_DB="${POSTGRES_CONFORMANCE_DB:-conduit_conformance}"
API_PORT="${CONFORMANCE_API_PORT:-3999}"

if ! command -v hurl > /dev/null 2>&1; then
  echo "ERREUR: hurl est requis pour la suite de conformité."
  echo "        Installation : https://hurl.dev/docs/installation.html"
  echo "        (macOS : brew install hurl)"
  exit 1
fi

manages_docker=0

if [ -n "${CONFORMANCE_DATABASE_URL:-}" ]; then
  echo "→ base de conformité fournie par l'environnement (mode CI)."
  DATABASE_URL="$CONFORMANCE_DATABASE_URL"
else
  if ! command -v docker > /dev/null 2>&1 || ! docker info > /dev/null 2>&1; then
    echo "ERREUR: Docker est requis pour la suite de conformité (base isolée)."
    echo "        Démarre Docker, ou fournis CONFORMANCE_DATABASE_URL."
    exit 1
  fi
  manages_docker=1
  echo "→ démarrage de la base de test ($COMPOSE_SERVICE, profile test)..."
  docker compose --profile test up -d "$COMPOSE_SERVICE"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public"
fi

export DATABASE_URL

# Même garde que la lane d'intégration, et pour la même raison : ce script
# **détruit** le contenu de la base cible avant de commencer. La règle porte sur
# le nom de la base, pas sur l'URL entière — un hôte nommé « test.interne » ne
# rend pas jetable la base `conduit_prod` qu'il héberge.
TARGET_DB="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
if ! printf '%s' "$TARGET_DB" | grep -q 'conformance'; then
  echo "ERREUR: la base cible « $TARGET_DB » n'a pas « conformance » dans son nom."
  echo "        Refus de lancer une suite qui vide des tables sur une base qui ne s'annonce pas jetable."
  exit 1
fi

api_pid=""

cleanup() {
  local status=$?
  if [ -n "$api_pid" ] && kill -0 "$api_pid" 2> /dev/null; then
    echo "→ arrêt de l'API..."
    kill "$api_pid" 2> /dev/null || true
    wait "$api_pid" 2> /dev/null || true
  fi
  exit "$status"
}
# Le trap couvre l'interruption autant que l'échec : sans lui, un Ctrl-C au
# milieu du run laisserait un serveur orphelin occuper le port, et le run suivant
# échouerait pour une raison sans rapport avec la conformité.
trap cleanup EXIT INT TERM

if [ "$manages_docker" -eq 1 ]; then
  echo "→ attente de la base..."
  ready=0
  for _ in $(seq 1 60); do
    if docker compose --profile test exec -T "$COMPOSE_SERVICE" \
      pg_isready -U "$PG_USER" -d postgres > /dev/null 2>&1; then
      ready=$((ready + 1))
      # Trois succès consécutifs exigés : `initdb` démarre un serveur temporaire
      # avant le définitif, et un `pg_isready` isolé peut interroger le premier.
      # Défaut réel rencontré sur la lane d'intégration, corrigé de la même
      # façon (voir `artifacts/lessons.md`).
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

  # `CREATE DATABASE` est volontairement tolérant à l'existant : le conteneur
  # survit entre deux runs, ses données sont en tmpfs de toute façon.
  docker compose --profile test exec -T "$COMPOSE_SERVICE" \
    psql -U "$PG_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
    || docker compose --profile test exec -T "$COMPOSE_SERVICE" \
      psql -U "$PG_USER" -d postgres -c "CREATE DATABASE ${PG_DB};" > /dev/null
fi

echo "→ application des migrations (prisma migrate deploy)..."
pnpm --filter @repo/api exec prisma migrate deploy

# Base vierge avant de commencer (REQ-CONF-001) : la suite fabrique ses propres
# comptes à partir d'un identifiant de run, mais elle compte aussi des tags
# globaux et des listes d'articles. Un résidu du run précédent la ferait échouer
# sur un chemin qui n'a rien à voir avec la conformité.
echo "→ base remise à vide..."
# `--url` explicite plutôt que `--schema` : `prisma db execute` sait résoudre la
# datasource depuis le schéma, mais celui-ci lit `DATABASE_URL` en passant par
# `apps/api/.env`. Nommer l'URL ici garantit que la purge frappe la base que ce
# script a choisie, et pas celle du poste de développement.
pnpm --filter @repo/api exec prisma db execute --url "$DATABASE_URL" --stdin <<< \
  'TRUNCATE TABLE favorites, follows, comments, articles, tags, users RESTART IDENTITY CASCADE;'

echo "→ build de l'API..."
# Par **turbo**, jamais par `pnpm --filter @repo/api build` : la tâche `build`
# déclare `dependsOn: ["^build", "db:generate"]`, donc le graphe fournit à la
# fois le build de `@repo/shared` et le client Prisma. Appeler le script du
# workspace directement contournerait les deux — c'est exactement le patron qui
# a cassé la CI deux fois dans ce dépôt (`3bfa792`, `28c2b23`), et à chaque fois
# le poste local le masquait parce que `dist/` et le client y traînaient d'un
# run antérieur.
pnpm exec turbo run build --filter=@repo/api

echo "→ démarrage de l'API sur le port ${API_PORT}..."
(
  cd apps/api
  # `JWT_SECRET` n'a pas de valeur par défaut dans le schéma d'env (item B1) :
  # le fournir ici est délibéré et sans conséquence, la base étant jetable.
  NODE_ENV=production \
    PORT="$API_PORT" \
    DATABASE_URL="$DATABASE_URL" \
    JWT_SECRET="${CONFORMANCE_JWT_SECRET:-conformance-run-secret-jetable-0123456789}" \
    CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000}" \
    node dist/main.js
) &
api_pid=$!

echo "→ attente de l'API..."
up=0
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:${API_PORT}/api/tags" > /dev/null 2>&1; then
    up=1
    break
  fi
  # Si le process est mort, inutile d'attendre 60 s pour l'apprendre : le vrai
  # diagnostic est déjà dans sa sortie, au-dessus.
  if ! kill -0 "$api_pid" 2> /dev/null; then
    echo "ERREUR: l'API s'est arrêtée avant d'être prête (voir sa sortie ci-dessus)."
    exit 1
  fi
  sleep 1
done
if [ "$up" -ne 1 ]; then
  echo "ERREUR: l'API ne répond pas après 60 s."
  exit 1
fi

# `uid` distingue les comptes et articles d'un run à l'autre. La suite amont le
# dérive de l'horodatage et du PID ; on garde la même forme, elle n'a besoin que
# d'être unique.
UID_VAL="${CONFORMANCE_UID:-$(date +%s)$$}"

# describe REQ-CONF-001
# it AC-1: les 13 fichiers de la suite officielle passent contre une base vierge
echo "→ exécution de la suite officielle (13 fichiers)..."
# `--jobs 1` est imposé par la suite elle-même : ses fichiers partagent des
# ressources globales (liste des tags, pagination du flux public), donc les
# paralléliser produirait des échecs qui ne disent rien de la conformité.
#
# La suite EN ENTIER, sans exclusion : la déclarer sur un sous-ensemble choisi
# par nous la viderait de son sens (REQ-CONF-001 AC-1).
hurl --test \
  --jobs 1 \
  --variable "host=http://localhost:${API_PORT}" \
  --variable "uid=${UID_VAL}" \
  "$SUITE_DIR"/*.hurl
