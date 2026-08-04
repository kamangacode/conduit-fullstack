import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { type Requirement, requirementSchema } from './schema.ts'

/**
 * Lecture du référentiel d'exigences — la couche partagée par tous les outils
 * qui le consomment (`validate.ts`, `matrix.ts`).
 *
 * Elle est ici plutôt que dupliquée dans chaque script parce que la façon de
 * découvrir et de parser un REQ fait partie de la convention : deux lecteurs
 * qui divergeraient (l'un ignorant les `README.md`, l'autre pas) produiraient
 * deux vérités sur le même dossier.
 *
 * Cette couche ne juge que la **forme**. Les contrôles d'intégrité qui
 * confrontent le REQ au disque restent dans `validate.ts`, seul responsable du
 * verdict bloquant.
 */

type ParsedRequirement = { file: string; requirement: Requirement }

export type ReferentialLoad = {
  requirements: ParsedRequirement[]
  errors: Array<{ file: string; message: string }>
}

/**
 * Tout `.md` du référentiel, à deux exceptions près : les fichiers et dossiers
 * techniques préfixés `_` (gabarit, scripts, artefacts générés) et les
 * `README.md` de documentation. Tout le reste est traité comme un REQ —
 * délibérément, plutôt que de ne ramasser que `REQ-*.md` : un fichier égaré
 * dans `functional/article/` doit produire une erreur, pas être ignoré.
 */
export function collectRequirementFiles(dir: string): string[] {
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

/** Parse + valide la forme d'un fichier. Retourne les motifs d'échec plutôt que de lever. */
export function parseRequirementFile(file: string): Requirement | string[] {
  const parts = splitFrontmatter(readFileSync(file, 'utf8'))
  if (!parts) {
    return ['frontmatter YAML absent ou non terminé (délimiteurs `---`)']
  }
  if (parts.body.trim().length === 0) {
    return ['corps vide : le REQ doit porter le contexte que le frontmatter ne peut pas dire']
  }

  let data: unknown
  try {
    data = parseYaml(parts.frontmatter)
  } catch (error) {
    return [`frontmatter YAML illisible : ${(error as Error).message}`]
  }

  const result = requirementSchema.safeParse(data)
  if (!result.success) {
    return result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(racine)'} — ${issue.message}`
    )
  }
  return result.data
}

/** Charge tout le référentiel en séparant ce qui est exploitable de ce qui ne l'est pas. */
export function loadReferential(dir: string): ReferentialLoad {
  const load: ReferentialLoad = { requirements: [], errors: [] }
  for (const file of collectRequirementFiles(dir)) {
    const parsed = parseRequirementFile(file)
    if (Array.isArray(parsed)) {
      for (const message of parsed) {
        load.errors.push({ file, message })
      }
      continue
    }
    load.requirements.push({ file, requirement: parsed })
  }
  return load
}
