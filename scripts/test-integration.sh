#!/usr/bin/env bash
# Orchestre la lane de tests d'intégration de `apps/api` contre une vraie
# PostgreSQL : base de test isolée → migrations → Vitest → purge, même en échec.
#
# Deux modes, un seul chemin de code :
#   - **local** : le script démarre le service `postgres-test` du
#     docker-compose (profile `test`, stockage tmpfs éphémère) et construit
#     l'URL lui-même ;
#   - **CI** : la base est déjà fournie par un service du job, qui pose
#     `TEST_DATABASE_URL` — le script ne touche alors pas à Docker.
#
# Pourquoi une variable dédiée (`TEST_DATABASE_URL`) et jamais un repli sur
# `DATABASE_URL` : la lane vide des tables. Se rabattre sur la variable de
# développement — présente dans le shell d'à peu près n'importe quel
# développeur — reviendrait à purger sa base de travail sans qu'aucune commande
# ne l'ait annoncé. La garde de `apps/api/test/integration/setup.ts` ferme la
# même porte côté runtime, en refusant toute base dont le nom ne contient pas
# « test ».
#
# Item C1 du plan d'outillage (Phase R). Convention : rule 15.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_SERVICE="postgres-test"
PG_USER="${POSTGRES_TEST_USER:-conduit}"
PG_PASSWORD="${POSTGRES_TEST_PASSWORD:-conduit}"
PG_DB="${POSTGRES_TEST_DB:-conduit_test}"
PG_PORT="${POSTGRES_TEST_PORT:-55432}"

manages_docker=0

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  echo "→ base de test fournie par l'environnement (mode CI)."
  DATABASE_URL="$TEST_DATABASE_URL"
else
  if ! command -v docker > /dev/null 2>&1 || ! docker info > /dev/null 2>&1; then
    echo "ERREUR: Docker est requis pour la lane d'intégration (base de test isolée)."
    echo "        Démarre Docker, ou fournis TEST_DATABASE_URL pour pointer une base existante."
    echo "        La lane unit (\`pnpm test\`) reste utilisable sans Docker."
    exit 1
  fi
  manages_docker=1
  echo "→ démarrage de la base de test ($COMPOSE_SERVICE, profile test)..."
  docker compose --profile test up -d "$COMPOSE_SERVICE"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}?schema=public"
fi

export DATABASE_URL

# Sécurité avant toute écriture. La règle porte sur le **nom de la base**, pas
# sur l'URL entière : un hôte nommé `test-db.interne` ne rend pas jetable la
# base `conduit_prod` qu'il héberge. `apps/api/test/integration/setup.ts`
# applique exactement la même règle au moment du run — deux barrières, une seule
# définition de ce qui compte comme base de test.
TARGET_DB="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
if ! printf '%s' "$TARGET_DB" | grep -q 'test'; then
  echo "ERREUR: la base cible « $TARGET_DB » n'a pas « test » dans son nom."
  echo "        Refus de lancer une suite qui purge des tables sur une base qui ne s'annonce pas jetable."
  exit 1
fi

wait_for_postgres() {
  echo "→ attente de la base..."
  for _ in $(seq 1 60); do
    if docker compose --profile test exec -T "$COMPOSE_SERVICE" \
      pg_isready -U "$PG_USER" -d "$PG_DB" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERREUR: la base de test n'est pas prête après 60 s."
  return 1
}

if [ "$manages_docker" -eq 1 ]; then
  wait_for_postgres
fi

# Purge de dernier recours (rule 15 : base vidée « même en cas d'échec »).
#
# Le chemin nominal est le `globalTeardown` de Vitest, qui purge via Prisma en
# fin de suite, succès comme échec. Ce trap couvre ce que le teardown ne peut
# pas couvrir : un run tué avant qu'il ne s'exécute (Ctrl-C, crash du runner).
#
# Il passe par `psql` dans le conteneur plutôt que par Node : à ce stade, le
# processus de test n'existe peut-être plus, et une purge qui dépendrait de lui
# échouerait précisément dans le cas qu'elle est censée traiter. En mode CI il
# n'y a rien à faire — le service de base est détruit avec le job.
#
# Le conteneur, lui, reste debout entre deux runs : le redémarrer coûterait plus
# cher que la purge, et ses données sont en tmpfs de toute façon.
purge() {
  local status=$?
  if [ "$manages_docker" -eq 1 ]; then
    echo "→ purge de la base de test..."
    if ! docker compose --profile test exec -T "$COMPOSE_SERVICE" \
      psql -U "$PG_USER" -d "$PG_DB" \
      -c 'TRUNCATE TABLE favorites, follows, comments, articles, tags, users RESTART IDENTITY CASCADE;' \
      > /dev/null; then
      # Signalé, jamais avalé : une purge silencieusement ratée laisse la base
      # peuplée et fait échouer le run suivant pour une raison sans rapport.
      echo "  AVERTISSEMENT: purge échouée. Nettoyer avec :"
      echo "    docker compose --profile test down"
    fi
  fi
  exit "$status"
}
trap purge EXIT INT TERM

echo "→ application des migrations (prisma migrate deploy)..."
pnpm --filter @repo/api exec prisma migrate deploy

echo "→ exécution de la lane d'intégration..."
pnpm --filter @repo/api exec vitest run --config vitest.integration.config.mts
