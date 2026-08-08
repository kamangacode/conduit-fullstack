#!/usr/bin/env bash
# Met le verrou SQL brut en échec, forme d'appel par forme d'appel (REQ-SEC-002).
#
# Le verrou est un plugin GritQL déclaré dans `biome.json`
# ([ADR 024](../docs/adr/024-verrou-sql-brut-plugin-biome.md)). Sa promesse —
# « `$queryRawUnsafe` et `$executeRawUnsafe` ne peuvent pas entrer dans le
# dépôt » — est invérifiable par lecture : le fichier existe, la ligne de config
# est là, et rien ne dit que le motif matche encore quoi que ce soit.
#
# **Et ce verrou-là se dégrade en silence par construction.** Un plugin GritQL
# qui ne compile pas est rapporté par Biome en `info`, avec un code de sortie
# **0**. Constaté pendant l'écriture : un groupe capturant de trop dans la regex
# (`(…)` au lieu de `(?:…)`) et le plugin rend « regex pattern matched 1
# variables, but expected 0 » — message noyé dans un rapport vert. Un dépôt qui
# se fierait à la présence du fichier croirait son SQL protégé pendant des mois.
#
# Ce script soumet donc au **vrai `biome.json`** (via `--config-path`) des
# fixtures écrites hors du dépôt, et exige un rejet effectif — code de sortie
# non nul **et** diagnostic du plugin dans la sortie. Le second point n'est pas
# une ceinture de plus : `biome check` porte aussi le format et les autres
# règles, donc un code non nul seul ne dirait pas *qui* a parlé.
#
# Trois familles de cas :
#   - **Rejet** (AC-1) : les trois formes d'appel réelles, sur les deux méthodes.
#   - **Acceptation** (AC-2, AC-3) : contrôles négatifs. Un verrou qui refuse
#     aussi `$queryRaw` paramétré, ou qui rougit sur le mot dans un commentaire,
#     se fait désactiver dans la semaine — et emporte alors ce qu'il protégeait.
#     C'est aussi ce qui sépare une analyse d'AST d'un `grep` : le `grep` de la
#     rule 19 aurait signalé la chaîne et le commentaire.
#   - **Contrôle du contrôle** (AC-4) : le même harnais, la même fixture, mais
#     une config **sans** le plugin. Il doit rapporter « accepté ». Sinon ses
#     « refusé » viennent d'autre chose que du verrou, et toute la phase 1 ne
#     prouve rien.
#
# Lancé en pre-push (lefthook) et dans le job CI `Quality`. Item B6 du plan.
#
# describe REQ-SEC-002 — interdiction du SQL brut non paramétré

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIOME="$REPO_ROOT/node_modules/.bin/biome"
SANDBOX="$(mktemp -d -t verify-sql-raw-guard-XXXXXX)"
FAILURES=0

# Le diagnostic attendu, reconnaissable entre tous ceux que `biome check` peut
# produire. Le chercher dans la sortie est ce qui distingue « le verrou a mordu »
# de « le fichier était mal formaté ».
MARKER='SQL brut non paramétré'

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

[ -x "$BIOME" ] || { echo "ECHEC : $BIOME introuvable (pnpm install ?)" >&2; exit 1; }

# Les fixtures vivent **hors** du dépôt : y écrire un appel interdit, même
# temporairement, ferait rougir le lint de celui qui lance la vérification et,
# pire, laisserait un fichier interdit derrière un run interrompu.
#
# Elles sont écrites au format du dépôt (guillemets simples, pas de
# point-virgule, indentation 2) : une fixture mal formatée ferait sortir
# `biome check` en non nul pour une raison qui n'a rien à voir, et la phase 2
# rapporterait un faux échec.
write_fixture() {
  local name="$1" body="$2"
  printf '%s\n' "$body" > "$SANDBOX/$name"
}

# Lance Biome sur une fixture avec la config passée en paramètre — la vraie par
# défaut. Rend 0 si le VERROU a parlé, 1 sinon. La config est un paramètre et
# non une constante : c'est ce qui permet à la phase 3 de soumettre au même
# harnais une config privée de son plugin.
guard_rejects() {
  local name="$1" config="${2:-$REPO_ROOT}"
  local output status=0
  output="$("$BIOME" check --config-path="$config" "$SANDBOX/$name" 2>&1)" || status=$?
  [ "$status" -ne 0 ] && printf '%s' "$output" | grep -qF "$MARKER"
}

expect_reject() {
  local label="$1" name="$2" body="$3"
  write_fixture "$name" "$body"
  if guard_rejects "$name"; then
    echo "  ok : $label — refusé"
  else
    echo "  ECHEC : $label — le verrou a laissé passer du SQL brut ($name)"
    FAILURES=$((FAILURES + 1))
  fi
}

expect_accept() {
  local label="$1" name="$2" body="$3"
  write_fixture "$name" "$body"
  if guard_rejects "$name"; then
    echo "  ECHEC : $label — le verrou a refusé une forme légitime ($name)"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ok : $label — accepté"
  fi
}

# --- Phase 1 ------------------------------------------------------------------
#
# Les trois formes ne sont pas une collection d'exemples : ce sont les trois
# nœuds d'AST distincts qu'un même appel peut prendre. Le motif d'origine, écrit
# sur `$obj.$method(...)`, passait à côté du chaînage optionnel — ce cas-ci est
# la raison pour laquelle il porte aujourd'hui sur le callee entier.
#
# it AC-1: les trois formes d'appel sont refusées, sur les deux méthodes
echo "phase 1 — rejet : le SQL brut non paramétré ne passe sous aucune forme"
expect_reject "receveur simple" "direct.ts" \
  "declare const prisma: { \$queryRawUnsafe: (s: string) => unknown }
export const run = (input: string) => prisma.\$queryRawUnsafe(\`SELECT \${input}\`)"
expect_reject "receveur imbriqué" "nested.ts" \
  "declare const self: { prisma: { \$executeRawUnsafe: (s: string) => unknown } }
export const run = (input: string) => self.prisma.\$executeRawUnsafe(\`DELETE \${input}\`)"
expect_reject "chaînage optionnel" "optional.ts" \
  "declare const prisma: { \$queryRawUnsafe: (s: string) => unknown } | null
export const run = (input: string) => prisma?.\$queryRawUnsafe(\`SELECT \${input}\`)"
expect_reject "executeRawUnsafe direct" "execute.ts" \
  "declare const prisma: { \$executeRawUnsafe: (s: string) => unknown }
export const run = (input: string) => prisma.\$executeRawUnsafe(\`DELETE \${input}\`)"

# --- Phase 2 ------------------------------------------------------------------
#
# it AC-2: les formes paramétrées, elles, passent
echo "phase 2 — la forme sûre reste ouverte"
expect_accept "queryRaw paramétré" "safe-query.ts" \
  "declare const prisma: { \$queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => unknown }
export const run = (input: string) => prisma.\$queryRaw\`SELECT * FROM users WHERE name = \${input}\`"
expect_accept "executeRaw paramétré" "safe-execute.ts" \
  "declare const prisma: { \$executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => unknown }
export const run = (id: string) => prisma.\$executeRaw\`DELETE FROM users WHERE id = \${id}\`"

# --- Phase 3 ------------------------------------------------------------------
#
# Ce que l'AST sait et qu'un `grep` ignore. La rule 19 laissait le choix entre
# une règle de lint et « un équivalent » ; ces deux cas montrent ce que coûte
# l'équivalent textuel — deux faux positifs sur une seule fixture.
#
# it AC-3: un nom voisin et une simple mention ne sont pas des appels
echo "phase 3 — absence de faux positif là où un grep en produirait"
expect_accept "nom voisin" "near-miss.ts" \
  "declare const prisma: { \$queryRawUnsafeWrapper: (s: string) => unknown }
export const run = (input: string) => prisma.\$queryRawUnsafeWrapper(input)"
expect_accept "mention en commentaire et en chaîne" "mention.ts" \
  "// Interdit dans ce dépôt : \$queryRawUnsafe
export const rule = 'ne jamais appeler \$executeRawUnsafe'"

# --- Phase 4 ------------------------------------------------------------------
#
# it AC-4: la vérification sait elle-même échouer
#
# Une config identique à la vraie, moins le plugin. Le harnais doit y rapporter
# « accepté » sur la fixture que la phase 1 voit refusée. S'il rapportait
# « refusé », c'est qu'il conclut sur autre chose que le verrou — un fichier mal
# formaté, une règle voisine — et chaque « ok » ci-dessus serait un faux.
#
# C'est le mode de panne le plus probable de ce script, parce qu'il ne ressemble
# pas à une panne : tout serait vert, y compris le jour où le plugin sortirait
# de `biome.json`.
echo "phase 4 — contrôle négatif : sans le plugin, la même fixture doit passer"
NEUTERED="$SANDBOX/config-sans-plugin"
mkdir -p "$NEUTERED"
printf '%s\n' '{ "linter": { "enabled": true }, "formatter": { "enabled": false } }' \
  > "$NEUTERED/biome.json"
write_fixture "canary.ts" \
  "declare const prisma: { \$queryRawUnsafe: (s: string) => unknown }
export const run = (input: string) => prisma.\$queryRawUnsafe(\`SELECT \${input}\`)"
if guard_rejects "canary.ts" "$NEUTERED"; then
  echo "  ECHEC : le harnais ne distingue pas une config sans plugin d'une config avec"
  FAILURES=$((FAILURES + 1))
else
  echo "  ok : le harnais voit bien passer la fixture quand le plugin est absent"
fi

echo
if [ "$FAILURES" -ne 0 ]; then
  echo "ECHEC : $FAILURES cas en défaut — le verrou SQL ne tient pas ses promesses." >&2
  exit 1
fi
echo "ok: le verrou refuse les trois formes d'appel brut, laisse passer les formes paramétrées et sait être mis en échec."
