import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { type Requirement, requirementSchema } from './schema.ts'

/**
 * Validateur du référentiel d'exigences (`pnpm requirements:validate`).
 *
 * Deux niveaux de contrôle, volontairement séparés :
 *   - `schema.ts` : la **forme** du frontmatter (pur, sans I/O, réutilisable) ;
 *   - ce fichier : l'**intégrité**, c'est-à-dire tout ce qui demande de
 *     confronter le REQ au disque — emplacement, unicité des identifiants,
 *     existence des fichiers et des ADR référencés.
 *
 * Le second niveau est celui qui a de la valeur dans la durée : un frontmatter
 * bien formé qui pointe vers un test supprimé six mois plus tôt affiche une
 * couverture qui n'existe plus. C'est exactement le mensonge qu'un référentiel
 * d'exigences est censé rendre impossible.
 *
 * Le gabarit `_template.md` est validé à chaque exécution : sans lui, un dépôt
 * sans REQ (l'état juste après la pose de ce rail) ferait passer le contrôle au
 * vert sans avoir rien vérifié.
 *
 * Usage : `pnpm requirements:validate [dossier]` — le dossier n'est surchargé
 * que par `scripts/verify-requirements-validator.sh`, qui vérifie sur des
 * fixtures que ce contrôle échoue bien quand il le doit.
 *
 * Item E2 du plan d'outillage (Phase R). Convention : rule 20.
 */

const REPO_ROOT = process.cwd()
const REQUIREMENTS_DIR = process.argv[2] ?? 'docs/requirements'
const ADR_DIR = 'docs/adr'
const TEMPLATE_NAME = '_template.md'

type Finding = { file: string; message: string }

const findings: Finding[] = []

function fail(file: string, message: string): void {
  findings.push({ file, message })
}

/**
 * Tout `.md` du référentiel, à deux exceptions près : les fichiers et dossiers
 * techniques préfixés `_` (gabarit, scripts) et les `README.md` de
 * documentation. Tout le reste est traité comme un REQ — délibérément, plutôt
 * que de ne ramasser que `REQ-*.md` : un fichier égaré dans
 * `functional/article/` doit produire une erreur, pas être ignoré en silence.
 */
function collectRequirementFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .filter((entry) => entry.name !== 'README.md')
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.split(sep).some((segment) => segment.startsWith('_')))
    .sort()
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } | null {
  if (!raw.startsWith('---\n')) {
    return null
  }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) {
    return null
  }
  return { frontmatter: raw.slice(4, end + 1), body: raw.slice(end + 4) }
}

/** Parse + valide la forme. Retourne `null` (en ayant consigné le motif) si le REQ est invalide. */
function loadRequirement(file: string): Requirement | null {
  const parts = splitFrontmatter(readFileSync(file, 'utf8'))
  if (!parts) {
    fail(file, 'frontmatter YAML absent ou non terminé (délimiteurs `---`)')
    return null
  }
  if (parts.body.trim().length === 0) {
    fail(file, 'corps vide : le REQ doit porter le contexte que le frontmatter ne peut pas dire')
    return null
  }

  let data: unknown
  try {
    data = parseYaml(parts.frontmatter)
  } catch (error) {
    fail(file, `frontmatter YAML illisible : ${(error as Error).message}`)
    return null
  }

  const result = requirementSchema.safeParse(data)
  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(file, `${issue.path.join('.') || '(racine)'} — ${issue.message}`)
    }
    return null
  }
  return result.data
}

/**
 * L'emplacement du fichier EST une donnée du référentiel : `{type}/{domain}/{id}.md`.
 * Le vérifier interdit qu'un REQ déclare `type: functional` tout en dormant dans
 * `non-functional/`, cas où toute agrégation par type devient fausse.
 */
function checkLocation(file: string, requirement: Requirement): void {
  const expected = join(
    REQUIREMENTS_DIR,
    requirement.type,
    requirement.domain,
    `${requirement.id}.md`
  )
  if (resolve(expected) !== resolve(file)) {
    fail(file, `emplacement incohérent avec le frontmatter — attendu \`${expected}\``)
  }
}

function adrExists(number: string): boolean {
  if (!existsSync(ADR_DIR)) {
    return false
  }
  return readdirSync(ADR_DIR).some((name) => name.startsWith(`${number}-`))
}

/** Contrôles de liens : un lien qui ne résout pas est une couverture imaginaire. */
function checkReferences(file: string, requirement: Requirement, knownIds: Set<string>): void {
  for (const path of [...requirement.implementation.files, ...requirement.implementation.tests]) {
    if (!existsSync(resolve(REPO_ROOT, path))) {
      fail(file, `référence morte : \`${path}\` n'existe pas`)
    }
  }
  for (const reference of requirement.related.requirements) {
    if (reference === requirement.id) {
      fail(file, 'related.requirements : un REQ ne peut pas se référencer lui-même')
    } else if (!knownIds.has(reference)) {
      fail(file, `related.requirements : \`${reference}\` ne correspond à aucun REQ du référentiel`)
    }
  }
  for (const adr of requirement.related.adrs) {
    if (!adrExists(adr)) {
      fail(file, `related.adrs : aucun ADR \`${adr}\` dans ${ADR_DIR}`)
    }
  }
}

function validateTemplate(): void {
  const template = join(REQUIREMENTS_DIR, TEMPLATE_NAME)
  if (!existsSync(template)) {
    fail(template, 'gabarit introuvable — un référentiel sans gabarit dérive au premier REQ écrit')
    return
  }
  // Forme seulement : les valeurs du gabarit sont des placeholders, ils ne
  // pointent volontairement vers aucun fichier réel.
  loadRequirement(template)
}

function validateRequirements(files: string[]): void {
  const idOwners = new Map<string, string>()
  const parsed: Array<{ file: string; requirement: Requirement }> = []

  for (const file of files) {
    const requirement = loadRequirement(file)
    if (!requirement) {
      continue
    }
    checkLocation(file, requirement)
    const previous = idOwners.get(requirement.id)
    if (previous) {
      fail(file, `identifiant \`${requirement.id}\` déjà porté par ${previous}`)
    } else {
      idOwners.set(requirement.id, file)
    }
    parsed.push({ file, requirement })
  }

  const knownIds = new Set(idOwners.keys())
  for (const { file, requirement } of parsed) {
    checkReferences(file, requirement, knownIds)
  }
}

function report(fileCount: number): void {
  if (findings.length > 0) {
    let current = ''
    for (const finding of findings) {
      if (finding.file !== current) {
        current = finding.file
        console.error(`\n${current}`)
      }
      console.error(`  ERREUR: ${finding.message}`)
    }
    console.error(
      `\nERREUR: ${findings.length} écart(s) dans ${REQUIREMENTS_DIR} (convention : rule 20).`
    )
    process.exitCode = 1
    return
  }

  if (fileCount === 0) {
    console.log(`ok: gabarit valide. Aucun REQ dans ${REQUIREMENTS_DIR} — rien d'autre à vérifier.`)
    return
  }
  console.log(`ok: gabarit et ${fileCount} REQ valides (forme, emplacement, unicité, références).`)
}

const requirementFiles = collectRequirementFiles(REQUIREMENTS_DIR)
validateTemplate()
validateRequirements(requirementFiles)
report(requirementFiles.length)
