import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { loadReferential } from './referential.ts'

/**
 * Matrice de traçabilité exigence → test (`pnpm requirements:matrix`) et
 * couverture AC-level (`pnpm requirements:coverage`).
 *
 * La question à laquelle ce script répond : **quel test prouve ce critère ?**
 * Le lien n'est pas déclaré dans un tableur qui dérive, il est déduit du
 * nommage des tests (rule 20) — `describe('REQ-ARTICLE-001 …')` et
 * `it('AC-1: …')`. Une convention de nommage qui n'est lue par aucun outil
 * n'est qu'une politesse ; lue par celui-ci, elle devient une donnée.
 *
 * Rattachement d'un `it` à son exigence : le dernier `describe` portant un
 * identifiant de REQ rencontré dans le fichier. C'est volontairement une
 * heuristique de lecture ligne à ligne plutôt qu'une analyse syntaxique — elle
 * suffit tant que la convention (un `describe` racine par exigence) est
 * respectée, et elle ne coûte aucune dépendance. Un `it('AC-n: …')` situé hors
 * de tout `describe` d'exigence est signalé comme orphelin, pas ignoré.
 *
 * La sortie est un **artefact dérivé, non versionné** (`_generated/` est dans
 * `.gitignore`) : voir ADR 005. Rapport, jamais gate — un taux de couverture
 * qui bloque avant d'avoir été calibré finit désactivé (rule 21).
 *
 * Item E3 du plan d'outillage (Phase R).
 */

const DEFAULT_REQUIREMENTS_DIR = 'docs/requirements'
const DEFAULT_TEST_ROOTS = ['apps', 'packages']
const DEFAULT_OUT_DIR = 'docs/requirements/_generated'
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage'])

const DESCRIBE_REQ = /describe\(\s*['"`](REQ-[A-Z]+-\d{3})/
const IT_AC = /\bit\(\s*['"`](AC-\d+)\s*:/

type Hit = { file: string; line: number }
type Coverage = Map<string, Map<string, Hit[]>>

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

const requirementsDir = flag('requirements', DEFAULT_REQUIREMENTS_DIR)
const testRoots = flag('tests', DEFAULT_TEST_ROOTS.join(',')).split(',')
const outDir = flag('out', DEFAULT_OUT_DIR)
const coverageOnly = process.argv.includes('--coverage-only')

function collectTestFiles(roots: string[]): string[] {
  const files: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) {
      continue
    }
    for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
      if (!(entry.isFile() && /\.(spec|test)\.tsx?$/.test(entry.name))) {
        continue
      }
      const path = join(entry.parentPath, entry.name)
      if (path.split(sep).some((segment) => IGNORED_DIRS.has(segment))) {
        continue
      }
      files.push(path)
    }
  }
  return files.sort()
}

/** Lecture ligne à ligne : le dernier `describe('REQ-…')` porte les `it('AC-n: …')` suivants. */
function scanTests(files: string[]): { coverage: Coverage; unknown: Array<Hit & { req: string }> } {
  const coverage: Coverage = new Map()
  const unknown: Array<Hit & { req: string }> = []

  for (const file of files) {
    let currentReq: string | null = null
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const describeMatch = DESCRIBE_REQ.exec(text)
        if (describeMatch?.[1]) {
          currentReq = describeMatch[1]
          return
        }
        const itMatch = IT_AC.exec(text)
        if (!itMatch?.[1]) {
          return
        }
        const hit: Hit = { file, line: index + 1 }
        if (!currentReq) {
          unknown.push({ ...hit, req: `(hors describe) ${itMatch[1]}` })
          return
        }
        const byCriterion = coverage.get(currentReq) ?? new Map<string, Hit[]>()
        byCriterion.set(itMatch[1], [...(byCriterion.get(itMatch[1]) ?? []), hit])
        coverage.set(currentReq, byCriterion)
      })
  }
  return { coverage, unknown }
}

type Row = { id: string; status: string; criterion: string; hits: Hit[] }

function buildRows(
  requirements: Array<{
    requirement: { id: string; status: string; acceptance_criteria: Array<{ id: string }> }
  }>,
  coverage: Coverage
): Row[] {
  const rows: Row[] = []
  for (const { requirement } of requirements) {
    for (const criterion of requirement.acceptance_criteria) {
      rows.push({
        id: requirement.id,
        status: requirement.status,
        criterion: criterion.id,
        hits: coverage.get(requirement.id)?.get(criterion.id) ?? [],
      })
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id) || a.criterion.localeCompare(b.criterion))
}

function percentage(part: number, total: number): string {
  return total === 0 ? 'n/a' : `${Math.round((part / total) * 100)} %`
}

function summaryTable(rows: Row[], requirementCount: number, unknownCount: number): string {
  const covered = rows.filter((row) => row.hits.length > 0).length
  const untested = new Set(rows.filter((row) => row.hits.length === 0).map((row) => row.id)).size
  return [
    '| Indicateur | Valeur |',
    '|---|---|',
    `| Exigences | ${requirementCount} |`,
    `| Critères d'acceptation | ${rows.length} |`,
    `| Critères couverts par au moins un test | ${covered} (${percentage(covered, rows.length)}) |`,
    `| Exigences dont au moins un critère n'est pas couvert | ${untested} |`,
    `| Tests rattachés à une exigence inconnue | ${unknownCount} |`,
  ].join('\n')
}

function formatHits(hits: Hit[]): string {
  return hits.length === 0 ? '—' : hits.map((hit) => `\`${hit.file}:${hit.line}\``).join('<br>')
}

function renderMatrix(rows: Row[], requirementCount: number, unknownCount: number): string {
  const body = rows.map(
    (row) => `| ${row.id} | ${row.status} | ${row.criterion} | ${formatHits(row.hits)} |`
  )
  return [
    '# Matrice de traçabilité exigence → test',
    '',
    'Artefact **généré** par `pnpm requirements:matrix` — ne pas éditer à la main.',
    "Ce dossier n'est pas versionné (voir [ADR 005](../../adr/005-matrice-de-tracabilite-generee.md)).",
    '',
    '## Couverture',
    '',
    summaryTable(rows, requirementCount, unknownCount),
    '',
    '## Matrice',
    '',
    '| Exigence | Statut | Critère | Tests |',
    '|---|---|---|---|',
    ...(body.length > 0 ? body : ['| — | — | — | — |']),
    '',
  ].join('\n')
}

function renderOrphans(rows: Row[], unknown: Array<Hit & { req: string }>): string {
  const untestedRequirements = [
    ...new Set(rows.filter((row) => row.hits.length === 0).map((row) => row.id)),
  ].sort()
  const uncovered = rows.filter((row) => row.hits.length === 0)

  const section = (title: string, lines: string[]): string[] => [
    `## ${title}`,
    '',
    ...(lines.length > 0 ? lines : ['_Aucun._']),
    '',
  ]

  return [
    '# Orphelins de traçabilité',
    '',
    'Artefact **généré** par `pnpm requirements:matrix` — ne pas éditer à la main.',
    '',
    ...section(
      'Exigences dont au moins un critère est non couvert',
      untestedRequirements.map((id) => `- ${id}`)
    ),
    ...section(
      "Critères d'acceptation sans test",
      uncovered.map((row) => `- ${row.id} / ${row.criterion}`)
    ),
    ...section(
      'Tests rattachés à une exigence inconnue',
      unknown.map((hit) => `- \`${hit.file}:${hit.line}\` — ${hit.req}`)
    ),
  ].join('\n')
}

const load = loadReferential(requirementsDir)
for (const error of load.errors) {
  console.warn(`ATTENTION: ${error.file} ignoré — ${error.message}`)
}

const { coverage, unknown } = scanTests(collectTestFiles(testRoots))
const knownIds = new Set(load.requirements.map(({ requirement }) => requirement.id))
for (const [reqId, byCriterion] of coverage) {
  if (knownIds.has(reqId)) {
    continue
  }
  for (const hits of byCriterion.values()) {
    for (const hit of hits) {
      unknown.push({ ...hit, req: reqId })
    }
  }
}

const rows = buildRows(load.requirements, coverage)

if (coverageOnly) {
  console.log(summaryTable(rows, load.requirements.length, unknown.length))
} else {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, 'traceability-matrix.md'),
    renderMatrix(rows, load.requirements.length, unknown.length)
  )
  writeFileSync(join(outDir, 'orphans.md'), renderOrphans(rows, unknown))
  console.log(
    `ok: matrice générée dans ${outDir} — ${load.requirements.length} exigence(s), ${rows.length} critère(s), ${unknown.length} test(s) orphelin(s).`
  )
}
