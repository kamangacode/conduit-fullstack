#!/usr/bin/env node
// Vérifie que le job `E2E` **bloque** réellement la CI (REQ-CONF-002 AC-5).
//
// ## Pourquoi un contrôle, et pas seulement une relecture
//
// Tant que la suite e2e était un rapport, sa non-blocance était une propriété
// qu'on lisait dans `ci.yml` : `continue-on-error` sur les étapes, absence du
// `needs` de `ci-success`. La bascule en gate (item #17) inverse la propriété
// mais pas sa nature — elle reste **écrite dans un fichier de configuration**,
// donc défaisable en une ligne.
//
// Et elle se défait pour de bonnes raisons apparentes : un `continue-on-error`
// ajouté « le temps de déboguer » un run rouge, un `needs` allégé en croyant
// accélérer la CI. Le job continue alors de tourner, son journal continue
// d'afficher un verdict, et rien ne change de couleur — c'est-à-dire le mode de
// panne exact que la liste blanche de `ci-success` a été écrite pour fermer
// après le run 31127768013, où cinq jobs requis n'avaient jamais démarré.
//
// Un gate qui peut redevenir un rapport sans que personne le voie n'est pas un
// gate. Ce script rend la propriété exécutable, et le job `Quality` la rejoue à
// chaque changement de `ci.yml` (le filtre `code` de `detect-changes` le liste).
//
// ## Le contrôle du contrôle, et pourquoi il vient d'abord
//
// Un vérificateur de configuration est le genre de script qui peut afficher
// « ok » pour de mauvaises raisons : une clé renommée en amont, un `needs`
// exprimé en chaîne plutôt qu'en liste, et il ne trouve plus rien à examiner —
// donc plus rien à reprocher. Les trois contrôles négatifs ci-dessous soumettent
// au même code trois copies délibérément abîmées du workflow réel : s'il en
// accepte une, il ne prouve plus rien et le script s'arrête avant même de rendre
// son verdict. Même parade qu'en B2 pour le garde-fou de secrets.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_PATH = join(REPO_ROOT, '.github/workflows/ci.yml')

const E2E_JOB = 'e2e'
const AGGREGATE_JOB = 'ci-success'

/**
 * Les trois maillons de la chaîne de blocage, énumérés dans l'ordre où ils
 * cassent en pratique.
 *
 * Aucun des trois ne suffit seul, et c'est le piège : une étape sans
 * `continue-on-error` dans un job absent du `needs` ne bloque rien ; un job
 * présent dans le `needs` mais jamais lu par la garde n'est pas examiné ; et un
 * job examiné dont les étapes sont tolérantes rend `success` quoi qu'il arrive.
 * La suite peut donc échouer et la CI rester verte par trois chemins
 * indépendants.
 */
function wiringProblems(workflow) {
  const jobs = workflow?.jobs ?? {}
  return [...intoleranceProblems(jobs[E2E_JOB]), ...aggregationProblems(jobs[AGGREGATE_JOB])]
}

/** Premier maillon : le job rend un échec, plutôt que de l'absorber. */
function intoleranceProblems(e2e) {
  if (!e2e) return [`le job « ${E2E_JOB} » est absent du workflow`]

  const problems = []
  if (e2e['continue-on-error']) {
    problems.push(`le job « ${E2E_JOB} » est en continue-on-error : son échec ne remonte pas`)
  }
  for (const step of e2e.steps ?? []) {
    if (step['continue-on-error']) {
      problems.push(`l'étape « ${step.name ?? step.run ?? '?'} » est en continue-on-error`)
    }
  }
  return problems
}

/** Deux maillons suivants : l'agrégat attend le job, et lit son statut. */
function aggregationProblems(aggregate) {
  if (!aggregate) return [`le job « ${AGGREGATE_JOB} » est absent du workflow`]

  const problems = []

  // `needs` accepte une chaîne pour une dépendance unique : la normaliser évite
  // qu'un jour de refonte le contrôle passe à côté sans rien signaler.
  const needs = [aggregate.needs ?? []].flat()
  if (!needs.includes(E2E_JOB)) {
    problems.push(`« ${E2E_JOB} » n'est pas dans le needs de « ${AGGREGATE_JOB} »`)
  }

  // La garde lit chaque statut par `needs.<job>.result` : c'est cette lecture,
  // et non la présence du nom quelque part dans le script, qui fait entrer le
  // job dans la liste blanche.
  const guard = (aggregate.steps ?? []).map((step) => step.run ?? '').join('\n')
  if (!guard.includes(`needs.${E2E_JOB}.result`)) {
    problems.push(`la garde de « ${AGGREGATE_JOB} » n'examine pas le statut de « ${E2E_JOB} »`)
  }

  return problems
}

/**
 * Trois façons de rendre le gate décoratif, chacune plausible, chacune opérée
 * sur une copie du workflow réel plutôt que sur un extrait fabriqué — un extrait
 * prouverait seulement que le contrôle sait lire ce qu'on a écrit pour lui.
 */
const SABOTAGES = [
  {
    label: 'une étape de la suite redevient tolérante',
    apply: (workflow) => {
      const steps = workflow.jobs[E2E_JOB].steps
      steps[steps.length - 1]['continue-on-error'] = true
    },
  },
  {
    label: "le job sort du needs de l'agrégat",
    apply: (workflow) => {
      workflow.jobs[AGGREGATE_JOB].needs = workflow.jobs[AGGREGATE_JOB].needs.filter(
        (job) => job !== E2E_JOB
      )
    },
  },
  {
    label: 'le job sort de la liste blanche de la garde',
    apply: (workflow) => {
      for (const step of workflow.jobs[AGGREGATE_JOB].steps ?? []) {
        if (step.run) step.run = step.run.replaceAll(`needs.${E2E_JOB}.result`, 'null')
      }
    },
  },
]

// describe REQ-CONF-002
// it AC-5: le job e2e fait échouer la CI — aucune étape tolérante, présent dans
// le needs de ci-success et dans la liste blanche de sa garde.
function main() {
  const source = readFileSync(WORKFLOW_PATH, 'utf8')

  for (const sabotage of SABOTAGES) {
    const damaged = parse(source)
    sabotage.apply(damaged)
    if (wiringProblems(damaged).length === 0) {
      console.error(
        `✗ contrôle du contrôle : « ${sabotage.label} » n'a pas été détecté.\n` +
          '  Ce script ne prouve donc plus rien sur le workflow réel.'
      )
      process.exit(1)
    }
  }

  const problems = wiringProblems(parse(source))
  if (problems.length > 0) {
    console.error('✗ Le job E2E ne bloque pas la CI :')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error(
      '\nLa suite e2e est un gate depuis #17 (ADR 018, REQ-CONF-002 AC-5).\n' +
        'La remettre en rapport se décide et se documente ; ça ne se constate pas ici.'
    )
    process.exit(1)
  }

  console.log(
    `✓ Le job « ${E2E_JOB} » bloque la CI : aucune étape tolérante, présent dans le needs et dans la garde de « ${AGGREGATE_JOB} ».`
  )
  console.log(`  ${SABOTAGES.length} sabotages du workflow réel détectés avant ce verdict.`)
}

main()
