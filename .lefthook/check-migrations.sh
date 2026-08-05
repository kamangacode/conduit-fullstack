#!/usr/bin/env bash
#
# check-migrations.sh — applique les nouvelles migrations Prisma sur un Postgres
# jetable pour attraper une erreur SQL (fonction non-IMMUTABLE dans un index,
# extension manquante, violation de contrainte) AVANT le push, pas en CI.
#
# Déclenché par le hook pre-push quand le diff à pousser touche
# apps/api/prisma/migrations/. No-op sinon.
#
# Requiert docker. Avertit et laisse passer (non-bloquant) si docker est absent :
# un contributeur sans Docker n'est pas bloqué, la CI reste le filet de sécurité.

set -euo pipefail

# ─── Portée du diff ──────────────────────────────────────────────────────
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [[ -z "$UPSTREAM" ]]; then
  # Pas encore d'upstream (premier push de la branche) : on diffe le dernier
  # commit plutôt que de sauter silencieusement la validation.
  RANGE="HEAD~1..HEAD"
else
  RANGE="$UPSTREAM..HEAD"
fi

MIGRATION_FILES="$(git diff --name-only "$RANGE" -- 'apps/api/prisma/migrations/' 2>/dev/null | grep -E '\.sql$' || true)"

if [[ -z "$MIGRATION_FILES" ]]; then
  echo "ℹ️  Aucune migration Prisma dans ce push — validation ignorée."
  exit 0
fi

echo "🧪 Migrations Prisma détectées dans le push :"
echo "$MIGRATION_FILES" | sed 's/^/   /'

# ─── Garde docker ────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "⚠️  docker introuvable — impossible de valider les migrations sur un Postgres jetable."
  echo "   La CI validera. Push autorisé (non-bloquant)."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "⚠️  démon docker arrêté — impossible de valider les migrations."
  echo "   Démarre Docker et réessaie, ou applique les migrations à la main. Push autorisé (non-bloquant)."
  exit 0
fi

# ─── Postgres jetable ────────────────────────────────────────────────────
PG_IMAGE="postgres:16-alpine"
CONTAINER_NAME="conduit-migration-check-$$"

echo "🚀 Démarrage de $PG_IMAGE ($CONTAINER_NAME)..."
CONTAINER_ID="$(docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=migration_check \
  -P \
  "$PG_IMAGE")"

cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

PORT="$(docker port "$CONTAINER_ID" 5432/tcp | head -1 | awk -F: '{print $NF}')"
if [[ -z "$PORT" ]]; then
  echo "❌ Impossible de résoudre le port du container. Validation abandonnée."
  exit 1
fi

# L'image Postgres démarre un serveur **temporaire** pendant `initdb`, l'arrête,
# puis démarre le serveur définitif. `pg_isready` répond donc « prêt » une
# première fois sur un serveur qui va disparaître : se fier au premier succès
# fait échouer l'étape suivante, au hasard de la fenêtre de redémarrage.
#
# On exige donc STABLE_CHECKS succès **consécutifs**. Le symptôme sans cette
# garde est trompeur — « pas prêt après 30s » alors que le script a rendu la main
# en 2 secondes — et il n'apparaît que sous charge, c'est-à-dire quand les autres
# jobs pre-push tournent en parallèle et ralentissent l'initialisation.
STABLE_CHECKS=3
READY_STREAK=0

echo "⏳ Attente de Postgres..."
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres >/dev/null 2>&1; then
    READY_STREAK=$((READY_STREAK + 1))
    if [[ "$READY_STREAK" -ge "$STABLE_CHECKS" ]]; then
      break
    fi
  else
    # Un échec après des succès signale le redémarrage post-initdb : on repart
    # de zéro plutôt que de cumuler des succès qui ne se suivent pas.
    READY_STREAK=0
  fi
  sleep 0.5
done

if [[ "$READY_STREAK" -lt "$STABLE_CHECKS" ]]; then
  echo "❌ Postgres n'est pas resté prêt ($READY_STREAK/$STABLE_CHECKS vérifications consécutives en 30s)."
  exit 1
fi

# ─── Application des migrations ───────────────────────────────────────────
export DATABASE_URL="postgresql://postgres:test@localhost:${PORT}/migration_check?schema=public"
echo "📦 'prisma migrate deploy' sur postgresql://***@localhost:${PORT}/migration_check..."

if ! pnpm --filter @repo/api exec prisma migrate deploy; then
  echo ""
  echo "❌ Validation des migrations ÉCHOUÉE — push bloqué."
  echo "   Corrige le SQL de la migration dans les commits ci-dessus, puis réessaie."
  echo "   Astuce : 'pnpm --filter @repo/api db:migrate' en local pour itérer vite."
  exit 1
fi

echo "✅ Toutes les migrations s'appliquent proprement. Push autorisé."
