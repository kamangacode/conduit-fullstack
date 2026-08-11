// Vérifie que `.github/workflows/codeql.yml` est câblé pour produire ce qu'il
// prétend produire (REQ-SEC-005).
//
// ## Le problème que ce contrôle traite
//
// Un workflow CodeQL mal câblé **réussit**. C'est ce qui le rend traître : le
// job est vert, la durée est plausible, et rien ne distingue une analyse
// publiée d'une analyse perdue. Trois façons de tout perdre sans un seul rouge :
//
//   - `security-events: write` absent → l'analyse tourne et l'upload échoue ;
//     l'onglet Security reste vide ;
//   - le langage `actions` retiré de la matrice → les workflows ne sont plus
//     analysés, et c'est justement la surface la plus risquée de ce dépôt
//     (`pull_request_target`) ;
//   - `pull_request` retiré des déclencheurs → l'analyse ne voit plus jamais un
//     changement avant qu'il n'atterrisse.
//
// Aucune de ces trois régressions ne produit d'échec. Elles ne se constatent
// qu'en lisant le câblage, donc ici.
//
// Le contrôle est **YAML-aware** et non textuel : il parse le fichier avec la
// dépendance `yaml` déjà présente à la racine. Un `grep` sur `security-events`
// serait satisfait par le mot en commentaire — et ce fichier en contient
// justement plusieurs.
//
// Usage : node scripts/check-codeql-wiring.mjs [chemin]
// Codes de sortie : 0 conforme, 1 au moins une propriété manquante.

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const WORKFLOW = process.argv[2] ?? '.github/workflows/codeql.yml'

/** Les deux langages que ce dépôt exige. Voir l'en-tête de `codeql.yml`. */
const REQUIRED_LANGUAGES = ['javascript-typescript', 'actions']

const failures = []
const fail = (message) => failures.push(message)
const ok = (message) => console.log(`  ok : ${message}`)

let workflow
try {
  workflow = parse(readFileSync(WORKFLOW, 'utf8'))
} catch (error) {
  console.error(`ECHEC : ${WORKFLOW} illisible ou YAML invalide — ${error.message}`)
  process.exit(1)
}

// `on` est un piège de YAML 1.1 : non quoté, il peut être interprété comme le
// booléen `true`. La bibliothèque `yaml` suit YAML 1.2 et rend bien la chaîne,
// mais accepter les deux clés coûte une ligne et évite un faux négatif si la
// version de parseur change un jour.
const triggers = workflow?.on ?? workflow?.true ?? {}
const jobs = workflow?.jobs ?? {}

// --- Déclencheurs -------------------------------------------------------------
if (triggers.pull_request) {
  ok('analysé sur pull_request')
} else {
  fail(
    "déclencheur `pull_request` absent — l'analyse ne verrait jamais un changement avant son merge"
  )
}

if (triggers.schedule) {
  ok('rejoué périodiquement (les requêtes évoluent sans que le code change)')
} else {
  fail('déclencheur `schedule` absent — une base inchangée ne serait jamais réanalysée')
}

// --- Le job d'analyse ---------------------------------------------------------
const analyzeJobs = Object.entries(jobs).filter(([, job]) =>
  (job?.steps ?? []).some((step) => String(step?.uses ?? '').includes('codeql-action/analyze'))
)

if (analyzeJobs.length === 0) {
  fail("aucun job n'appelle `github/codeql-action/analyze` — rien n'est publié")
  report()
}

for (const [name, job] of analyzeJobs) {
  // La permission dont l'absence est silencieuse. Elle peut être déclarée au
  // niveau du workflow ou du job ; les deux comptent.
  const permissions = { ...(workflow.permissions ?? {}), ...(job.permissions ?? {}) }
  if (permissions['security-events'] === 'write') {
    ok(`job « ${name} » : security-events: write`)
  } else {
    fail(
      `job « ${name} » : \`security-events: write\` absent — l'analyse tournerait sans publier, en restant verte`
    )
  }

  const languages = job?.strategy?.matrix?.language ?? []
  const missing = REQUIRED_LANGUAGES.filter((lang) => !languages.includes(lang))
  if (missing.length === 0) {
    ok(`job « ${name} » : langages ${REQUIRED_LANGUAGES.join(', ')}`)
  } else {
    fail(`job « ${name} » : langage(s) manquant(s) dans la matrice — ${missing.join(', ')}`)
  }

  // `build-mode: none` : ces langages s'analysent sans compilation. Sans lui,
  // CodeQL tente un autobuild qui n'a rien à construire ici.
  const initSteps = (job.steps ?? []).filter((step) =>
    String(step?.uses ?? '').includes('codeql-action/init')
  )
  if (initSteps.length === 0) {
    fail(`job « ${name} » : aucune étape \`codeql-action/init\``)
  } else if (initSteps.every((step) => step?.with?.['build-mode'] === 'none')) {
    ok(`job « ${name} » : build-mode none`)
  } else {
    fail(`job « ${name} » : \`build-mode: none\` attendu sur chaque étape d'initialisation`)
  }
}

report()

function report() {
  if (failures.length > 0) {
    console.error('')
    for (const message of failures) {
      console.error(`  ECHEC : ${message}`)
    }
    console.error(
      `\nECHEC : ${failures.length} défaut(s) de câblage — CodeQL resterait vert en ne publiant rien.`
    )
    process.exit(1)
  }
  console.log('ok: le workflow CodeQL publie bien, sur les deux langages et avant merge.')
  process.exit(0)
}
