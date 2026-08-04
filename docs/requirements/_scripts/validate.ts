import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { collectRequirementFiles, loadReferential, parseRequirementFile } from './referential.ts'
import type { Requirement } from './schema.ts'

/**
 * Validateur du référentiel d'exigences (`pnpm requirements:validate`).
 *
 * Trois couches, volontairement séparées :
 *   - `schema.ts`      : la **forme** du frontmatter (pur, sans I/O) ;
 *   - `referential.ts` : la **lecture** du dossier (découverte, parsing) ;
 *   - ce fichier       : l'**intégrité**, c'est-à-dire tout ce qui demande de
 *     confronter le REQ au disque — emplacement, unicité des identifiants,
 *     existence des fichiers et des ADR référencés.
 *
 * La dernière couche est celle qui a de la valeur dans la durée : un frontmatter
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
  const parsed = parseRequirementFile(template)
  if (Array.isArray(parsed)) {
    for (const message of parsed) {
      fail(template, message)
    }
  }
}

function validateRequirements(): void {
  const load = loadReferential(REQUIREMENTS_DIR)
  for (const error of load.errors) {
    fail(error.file, error.message)
  }

  const idOwners = new Map<string, string>()
  for (const { file, requirement } of load.requirements) {
    checkLocation(file, requirement)
    const previous = idOwners.get(requirement.id)
    if (previous) {
      fail(file, `identifiant \`${requirement.id}\` déjà porté par ${previous}`)
    } else {
      idOwners.set(requirement.id, file)
    }
  }

  const knownIds = new Set(idOwners.keys())
  for (const { file, requirement } of load.requirements) {
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

const requirementFileCount = collectRequirementFiles(REQUIREMENTS_DIR).length
validateTemplate()
validateRequirements()
report(requirementFileCount)
