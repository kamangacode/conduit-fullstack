#!/usr/bin/env bash
# Met le fail-fast de configuration en échec, variable par variable (REQ-SEC-004).
#
# La rule 19 demande qu'une configuration manquante empêche le boot plutôt que de
# dégrader en silence. Jusqu'ici, ce dépôt le prouvait par 12 tests unitaires sur
# `parseEnv` — la fonction pure — et par un démarrage constaté à la main une fois,
# consigné dans le journal de build. Les deux sont insuffisants, et pour la même
# raison : **ils ne voient pas l'ordre d'exécution du vrai point d'entrée**.
#
# Le défaut que ce script existe pour attraper a été mesuré le 2026-08-08.
# `main.ts` importait `AppModule` statiquement. Les imports sont hoistés, donc le
# graphe de modules — dont `@prisma/client`, qui charge `.env` comme effet de bord
# de son `require` — s'évaluait AVANT que `bootstrap()` n'appelle `parseEnv`. Un
# `apps/api/.env` traînant repeuplait `process.env` et l'API démarrait sans
# `DATABASE_URL` ni `JWT_SECRET` dans son environnement, en montant ses 34 routes.
# Le commentaire de `main.ts` affirmait pourtant que la validation avait lieu
# « avant NestJS, avant la moindre connexion ». Elle avait lieu après.
#
# Ce que ce script vérifie n'est donc pas que `parseEnv` sait refuser — `env.spec.ts`
# le fait déjà, et le faisait pendant que le défaut était en place. C'est que **le
# process réel s'arrête**, ce qui est une propriété du point d'entrée et de rien
# d'autre. La phase 5 le dit explicitement en soumettant au même harnais un point
# d'entrée qui reproduit l'ancien ordre : il doit démarrer, sans quoi le harnais ne
# distingue pas le défaut de sa correction.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`. Item B1 du plan.
#
# describe REQ-SEC-004 — fail-fast de la configuration d'environnement

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
ENTRYPOINT="$API_DIR/src/main.ts"
DOTENV="$API_DIR/.env"
SANDBOX="$(mktemp -d -t verify-env-fail-fast-XXXXXX)"
FAILURES=0

# Port volontairement haut et inhabituel : le contrôle positif de la phase 3
# démarre réellement le serveur, et tomber sur le port d'un serveur de dev
# rendrait un `EADDRINUSE` que rien ne distinguerait d'un refus de configuration.
# Les assertions portent de toute façon sur le message, pas sur le seul code de
# sortie — mais autant ne pas provoquer le cas.
TEST_PORT=45871

# Valeurs de fixture. `SENTINEL_SECRET` est reconnaissable à dessein : la phase 2
# vérifie qu'elle n'apparaît nulle part dans la sortie du process. Ces valeurs ne
# sont des secrets pour personne — elles n'ouvrent aucun accès et ne servent qu'à
# satisfaire, ou à violer, la forme attendue par le schéma Zod.
VALID_DB_URL="postgresql://canary:canary@127.0.0.1:5432/canary"
VALID_JWT_SECRET="0123456789abcdef0123456789abcdef"
SENTINEL_SECRET="trop-court-et-reconnaissable"

[ -f "$ENTRYPOINT" ] || { echo "ECHEC : $ENTRYPOINT introuvable" >&2; exit 1; }

# --- Fixture `.env` déterministe ----------------------------------------------
#
# Le cœur de cette vérification (phase 4) est qu'un fichier `.env` présent sur le
# disque ne peut pas rattraper une variable absente de l'environnement. Il faut
# donc qu'un `.env` existe, et qu'on sache ce qu'il contient — s'en remettre à
# celui du poste rendrait la phase 4 vacante sur une machine qui n'en a pas (la CI,
# précisément) et non reproductible sur celles qui en ont un.
#
# Celui du développeur est donc mis de côté et restauré par trap, y compris en cas
# d'échec ou d'interruption. Même parti pris que `verify-type-boundary.sh`, qui
# casse le modèle partagé puis le restaure : une vérification qui laisserait
# l'arbre de travail modifié serait pire que le défaut qu'elle cherche.
DOTENV_BACKUP="$SANDBOX/dotenv.backup"
DOTENV_RESTORE=0

cleanup() {
  if [ "$DOTENV_RESTORE" -eq 1 ]; then
    mv -f "$DOTENV_BACKUP" "$DOTENV"
  else
    rm -f "$DOTENV"
  fi
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

if [ -f "$DOTENV" ]; then
  cp -p "$DOTENV" "$DOTENV_BACKUP"
  DOTENV_RESTORE=1
fi
# Écarté dès maintenant : les phases 1 à 3 mesurent le point d'entrée seul, et le
# `.env` d'un poste de développement y injecterait des valeurs que la CI n'a pas.
# C'est précisément l'asymétrie poste/runner que la rule 02 nomme, prise à
# l'envers — ici c'est le poste qui produirait un faux **vert**.
rm -f "$DOTENV"

# La fixture `.env` n'est écrite qu'au moment de la phase 4, qui est la seule à en
# avoir besoin : y soumettre aussi les phases 1 à 3 les rendrait redondantes avec
# elle et brouillerait ce que chacune prouve.
write_dotenv_fixture() {
  cat > "$DOTENV" <<EOF
# Fixture écrite par scripts/verify-env-fail-fast.sh — supprimée en fin de run.
DATABASE_URL=$VALID_DB_URL
JWT_SECRET=$VALID_JWT_SECRET
EOF
}

# --- Harnais de démarrage ------------------------------------------------------
#
# Démarre un point d'entrée sous le même chargeur TypeScript que `pnpm dev`
# (`ts-node/register` + `tsconfig-paths/register`), **privé de son
# `--env-file-if-exists`** : c'est l'environnement qui doit fournir la
# configuration, et tout l'objet de la vérification est de constater ce qui se
# passe quand il ne le fait pas.
#
# `TS_NODE_TRANSPILE_ONLY` : une erreur de typage est le travail de `pnpm
# typecheck`. Ici elle produirait une sortie non nulle qu'on prendrait pour un
# refus de configuration — un faux vert, exactement ce que ce script combat.
#
# **Le verdict se lit dans la sortie, jamais dans la vivacité du process.** Une
# première version de ce script concluait sur « le process tourne-t-il encore ? »
# et se trompait dans les deux sens : un environnement valide fait tomber l'API
# sur sa connexion PostgreSQL (`P1000`) alors qu'elle a parfaitement franchi la
# porte de configuration, et un `EADDRINUSE` la fait tomber alors qu'aucune
# variable n'est en cause. Les deux marqueurs ci-dessous sont émis de part et
# d'autre de la porte, ce qui est exactement la frontière à observer — et ce
# choix rend la vérification **indépendante de toute base de données**, donc
# exécutable dans le job `Quality` qui n'en a pas.
MARKER_REFUSED="Configuration d'environnement invalide"
MARKER_PAST_GATE="Starting Nest application"

LAST_OUTPUT=""
BOOT_STATUS=0

boot() {
  local entrypoint="$1"; shift
  local logfile="$SANDBOX/boot.log"
  local pid

  rm -f "$logfile"
  (
    cd "$API_DIR" || exit 1
    # `env -u` retire les variables héritées du shell de l'appelant : un
    # développeur qui a exporté DATABASE_URL dans son profil rendrait sinon la
    # phase 1 vacante sans que rien ne le signale.
    env -u DATABASE_URL -u JWT_SECRET -u JWT_EXPIRES_IN -u CORS_ORIGIN -u PORT \
        TS_NODE_TRANSPILE_ONLY=true \
        "$@" \
        node --require ts-node/register --require tsconfig-paths/register "$entrypoint"
  ) > "$logfile" 2>&1 &
  pid=$!

  # Attente bornée, et surtout **arrêtée dès que le verdict est acquis** : une
  # fois la porte franchie, attendre la fin du process ne ferait qu'ajouter le
  # délai de connexion PostgreSQL à chacun des sept démarrages. Un garde-fou de
  # pre-push qui coûte une minute se fait retirer du pre-push.
  local waited=0
  while [ "$waited" -lt 120 ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    if grep -qF "$MARKER_PAST_GATE" "$logfile" 2>/dev/null; then
      break
    fi
    sleep 0.5
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    BOOT_STATUS=0
  else
    BOOT_STATUS=0
    wait "$pid" 2>/dev/null || BOOT_STATUS=$?
  fi
  LAST_OUTPUT="$(cat "$logfile")"
}

# Un refus se constate sur trois faits conjoints : le process s'arrête en erreur,
# il le dit avec le message de configuration, et il nomme la variable fautive.
# Exiger les trois est ce qui empêche de compter comme fail-fast un process qui
# meurt d'un port occupé ou d'un module manquant.
expect_refusal() {
  local label="$1" needle="$2"; shift 2
  boot "$ENTRYPOINT" "$@"
  if [ "$BOOT_STATUS" -eq 0 ]; then
    echo "  ECHEC : $label — le process n'est pas sorti en erreur"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if ! printf '%s' "$LAST_OUTPUT" | grep -qF "$MARKER_REFUSED"; then
    echo "  ECHEC : $label — arrêt constaté, mais pas sur un refus de configuration"
    printf '%s\n' "$LAST_OUTPUT" | tail -3
    FAILURES=$((FAILURES + 1))
    return
  fi
  if ! printf '%s' "$LAST_OUTPUT" | grep -qF -- "$needle"; then
    echo "  ECHEC : $label — refus constaté mais le message ne nomme pas « $needle »"
    FAILURES=$((FAILURES + 1))
    return
  fi
  echo "  ok : $label — refusé, et le message nomme « $needle »"
}

# Le pendant du précédent : la porte laisse passer. On exige la trace positive
# (`$MARKER_PAST_GATE`) en plus de l'absence de refus, sans quoi un point
# d'entrée qui planterait avant même d'atteindre la validation serait compté
# comme « accepté ».
expect_gate_passed() {
  local label="$1" entrypoint="$2"; shift 2
  boot "$entrypoint" "$@"
  if printf '%s' "$LAST_OUTPUT" | grep -qF "$MARKER_REFUSED"; then
    echo "  ECHEC : $label — la configuration a été refusée alors qu'elle ne devait pas l'être"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if ! printf '%s' "$LAST_OUTPUT" | grep -qF "$MARKER_PAST_GATE"; then
    echo "  ECHEC : $label — la porte n'a pas été franchie, pour une raison étrangère à la configuration"
    printf '%s\n' "$LAST_OUTPUT" | tail -3
    FAILURES=$((FAILURES + 1))
    return
  fi
  echo "  ok : $label — porte franchie"
}

# it AC-1: chaque variable requise absente ou malformée arrête le process
echo "phase 1 — rejet : une configuration invalide doit arrêter le démarrage"
expect_refusal "DATABASE_URL absente" "DATABASE_URL" \
  JWT_SECRET="$VALID_JWT_SECRET"
expect_refusal "JWT_SECRET absent" "JWT_SECRET" \
  DATABASE_URL="$VALID_DB_URL"
expect_refusal "JWT_SECRET trop court" "JWT_SECRET" \
  DATABASE_URL="$VALID_DB_URL" JWT_SECRET="court"
expect_refusal "DATABASE_URL non-PostgreSQL" "DATABASE_URL" \
  DATABASE_URL="mysql://u:p@127.0.0.1:3306/db" JWT_SECRET="$VALID_JWT_SECRET"
expect_refusal "PORT non numérique" "PORT" \
  DATABASE_URL="$VALID_DB_URL" JWT_SECRET="$VALID_JWT_SECRET" PORT="quatre-mille"

# it AC-2: la valeur fautive n'est jamais réaffichée dans le message d'erreur
#
# Ces messages partent sur la sortie standard au démarrage, donc dans les logs de
# la plateforme d'hébergement — un endroit que bien plus de gens peuvent lire que
# la variable elle-même. `env.spec.ts` teste déjà cette propriété sur `parseEnv` ;
# elle est reprise ici parce que c'est le process réel qui écrit dans ces logs, et
# qu'un `console.error(error)` au lieu de `error.message` suffirait à la rompre
# sans qu'aucun test unitaire ne bouge.
echo "phase 2 — non-divulgation : la valeur refusée n'apparaît pas dans la sortie"
boot "$ENTRYPOINT" DATABASE_URL="$VALID_DB_URL" JWT_SECRET="$SENTINEL_SECRET"
if [ "$BOOT_STATUS" -eq 0 ]; then
  echo "  ECHEC : le process n'est pas sorti en erreur avec un JWT_SECRET trop court"
  FAILURES=$((FAILURES + 1))
elif printf '%s' "$LAST_OUTPUT" | grep -qF -- "$SENTINEL_SECRET"; then
  echo "  ECHEC : la valeur refusée est réaffichée dans les logs de démarrage"
  FAILURES=$((FAILURES + 1))
else
  echo "  ok : la valeur refusée n'est pas réaffichée"
fi

# it AC-3: une configuration valide franchit la porte
#
# Contrôle positif, et il n'est pas décoratif : un garde-fou qui refuse tout
# passerait les phases 1, 2 et 4 sans en rater une seule, tout en rendant l'API
# indémarrable. C'est le mode de panne le plus coûteux de ce dispositif, et le
# seul que les phases de rejet ne peuvent pas voir.
#
# **Limite assumée** : ce que cette phase prouve est que la configuration est
# acceptée, pas que l'API sert du trafic. Le démarrage complet suppose une
# PostgreSQL joignable, que le job `Quality` n'a pas — l'exiger ici ferait de
# cette vérification un second test d'intégration, plus lent et redondant avec
# les 137 qui tournent déjà sur une vraie base.
echo "phase 3 — contrôle positif : une configuration complète est acceptée"
expect_gate_passed "configuration complète" "$ENTRYPOINT" \
  DATABASE_URL="$VALID_DB_URL" JWT_SECRET="$VALID_JWT_SECRET" PORT="$TEST_PORT"

# it AC-4: un fichier .env présent ne rattrape pas une variable absente
#
# LE critère de cette exigence. Un `.env` sur le disque est chargé dans
# `process.env` par `@prisma/client` au `require`, donc par un effet de bord
# d'import que personne n'a écrit dans ce dépôt et que rien ne rend visible à la
# lecture de `main.ts`. Tant que la validation s'exécutait après ce chargement,
# une image de production embarquant un `.env` par accident démarrait avec les
# valeurs du fichier au lieu de celles injectées par la plateforme — et la
# variable oubliée par l'opérateur ne faisait rougir personne.
#
# `dotenv` n'écrase pas une variable déjà posée : le risque n'est donc pas qu'un
# `.env` remplace une valeur légitime, mais qu'il **comble un trou** que le
# fail-fast avait pour seul rôle de signaler.
echo "phase 4 — un fichier .env ne peut pas rattraper une variable absente"
write_dotenv_fixture
if grep -qF 'DATABASE_URL=' "$DOTENV" 2>/dev/null; then
  expect_refusal "DATABASE_URL absente malgré un .env qui la définit" "DATABASE_URL" \
    JWT_SECRET="$VALID_JWT_SECRET"
else
  echo "  ECHEC : la fixture .env n'a pas été écrite, la phase ne prouve rien"
  FAILURES=$((FAILURES + 1))
fi

# it AC-5: le harnais sait distinguer un point d'entrée qui valide d'un qui ne valide pas
#
# Contrôle négatif. Sans lui, un `boot()` qui rendrait toujours « arrêté » — chemin
# faux, `node` introuvable, `cd` en échec — afficherait « ok » sur toutes les
# phases de rejet, et cette vérification deviendrait le garde-fou fantôme qu'elle
# est censée empêcher.
#
# Le point d'entrée soumis ici reproduit **l'ordre exact du défaut du 2026-08-08** :
# le graphe de modules est chargé d'abord, la validation ensuite. S'il ne démarre
# pas, c'est que le harnais conclut sur autre chose que le comportement réel, et
# les quatre phases précédentes ne prouvent rien.
echo "phase 5 — contrôle négatif : l'ancien ordre d'exécution doit être vu démarrer"
# Le point d'entrée régressé doit vivre dans `src/` : ses imports sont relatifs au
# graphe applicatif. Il est écrit à l'exécution et retiré aussitôt la phase
# terminée, y compris en cas d'échec (trap) — le laisser traînerait un second
# point d'entrée dans le dépôt, avec l'ordre qu'on vient de corriger.
REGRESSED_IN_SRC="$API_DIR/src/main.ordre-regresse.canary.ts"
trap 'rm -f "$REGRESSED_IN_SRC"; cleanup' EXIT
cat > "$REGRESSED_IN_SRC" <<'EOF'
// Reproduction de l'ordre d'exécution corrigé le 2026-08-08, écrite à l'exécution
// et supprimée aussitôt : l'import statique du graphe applicatif s'évalue avant
// toute instruction, donc avant la validation d'environnement.
import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { parseEnv } from './config/env'

async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env)
  const app = await NestFactory.create(AppModule)
  await app.listen(env.PORT)
}

void bootstrap()
EOF
# Même environnement amputé qu'en phase 4 — `DATABASE_URL` absente, `.env`
# présent. Le point d'entrée régressé doit **franchir** la porte : c'est le `.env`
# chargé par `@prisma/client` avant la validation qui comble le trou. S'il était
# refusé lui aussi, c'est que le refus viendrait d'autre chose que de l'ordre, et
# la phase 4 ne prouverait pas ce qu'elle annonce.
expect_gate_passed "ancien ordre, DATABASE_URL absente mais .env présent" \
  "$REGRESSED_IN_SRC" JWT_SECRET="$VALID_JWT_SECRET" PORT="$TEST_PORT"
rm -f "$REGRESSED_IN_SRC"

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le fail-fast de configuration ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: l'API refuse de démarrer sans configuration valide, y compris quand un .env pourrait la fournir."
