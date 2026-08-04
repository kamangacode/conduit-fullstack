import { z } from 'zod'

/**
 * Schéma du frontmatter d'une exigence (« REQ-as-code », rule 20).
 *
 * Une exigence versionnée n'a d'intérêt que si elle est **exploitable par une
 * machine** : sans forme contrainte, `docs/requirements/` redevient un dossier
 * de prose que personne ne relit et que rien ne relie aux tests. Ce schéma est
 * la forme contrainte ; `validate.ts` y ajoute les contrôles d'intégrité qui
 * demandent de regarder le disque (chemins, ids uniques, fichiers référencés).
 *
 * Le schéma reste **pur** (aucune I/O) pour rester réutilisable : le générateur
 * de matrice de traçabilité l'importe tel quel.
 */

// Ces constantes restent internes au module : n'exporter que ce qui est
// consommé (`requirementSchema` et son type inféré). Le générateur de matrice
// (E3) les exportera le jour où il en aura besoin — pas avant.

/** `functional` = comportement observable ; `non-functional` = qualité de service (NFR). */
const requirementTypes = ['functional', 'non-functional'] as const

/**
 * Cycle de vie. `implemented` est le seul statut qui engage : il affirme que du
 * code et des tests existent, donc il exige leur trace (voir `superRefine`).
 */
const requirementStatuses = ['draft', 'proposed', 'approved', 'implemented', 'deprecated'] as const

/** Priorisation MoSCoW. `wont` documente une exclusion assumée, pas un oubli. */
const requirementPriorities = ['must', 'should', 'could', 'wont'] as const

/** `REQ-{DOMAINE}-{NNN}` : le domaine en majuscules mappe sur un module. */
const REQ_ID_PATTERN = /^REQ-[A-Z]+-\d{3}$/

/** `AC-{N}` — le même identifiant que celui attendu en préfixe de `it()` (rule 20). */
const AC_ID_PATTERN = /^AC-[1-9]\d*$/

/** Dossier de rattachement, en kebab-case ASCII (`article`, `comment`, `user`…). */
const DOMAIN_PATTERN = /^[a-z][a-z0-9-]*$/

/** Numéro d'ADR sur 3 chiffres, tel qu'il apparaît dans `docs/adr/NNN-slug.md`. */
const ADR_ID_PATTERN = /^\d{3}$/

const nonEmpty = (label: string) => z.string().trim().min(1, `${label} : valeur vide`)

/**
 * Un critère d'acceptation Given/When/Then. Les trois branches sont obligatoires
 * et non vides : un critère sans `given` est une intention, pas un critère
 * testable, et il produirait un test qui ne prouve rien.
 */
const acceptanceCriterionSchema = z.strictObject({
  id: z.string().regex(AC_ID_PATTERN, 'identifiant attendu au format AC-N (AC-1, AC-2…)'),
  given: nonEmpty('given'),
  when: nonEmpty('when'),
  // biome-ignore lint/suspicious/noThenProperty: Given/When/Then est le vocabulaire imposé du critère d'acceptation (rule 20) ; le renommer désaccorderait le frontmatter des REQ de la convention qu'ils documentent. L'objet est une donnée validée par Zod, jamais awaitée ni importée dynamiquement — le risque de thenable ne s'applique pas.
  then: nonEmpty('then'),
})

/**
 * `strictObject` plutôt que `object` : une clé inconnue est refusée. Sans ça,
 * une faute de frappe (`aceptance_criteria`) passerait silencieusement, le REQ
 * serait « valide » et son critère invisible de la matrice de traçabilité.
 */
export const requirementSchema = z
  .strictObject({
    id: z.string().regex(REQ_ID_PATTERN, 'identifiant attendu au format REQ-DOMAINE-NNN'),
    title: nonEmpty('title'),
    type: z.enum(requirementTypes),
    domain: z.string().regex(DOMAIN_PATTERN, 'domaine attendu en kebab-case ASCII'),
    status: z.enum(requirementStatuses),
    priority: z.enum(requirementPriorities),
    /** Section du PRD dont l'exigence dérive (ex. « PRD §7.3 »). Ancre la traçabilité amont. */
    source: nonEmpty('source'),
    acceptance_criteria: z
      .array(acceptanceCriterionSchema)
      .min(1, 'au moins un critère d’acceptation est requis'),
    implementation: z
      .strictObject({
        files: z.array(nonEmpty('implementation.files[]')).default([]),
        tests: z.array(nonEmpty('implementation.tests[]')).default([]),
      })
      .default({ files: [], tests: [] }),
    related: z
      .strictObject({
        issues: z.array(z.number().int().positive()).default([]),
        requirements: z
          .array(z.string().regex(REQ_ID_PATTERN, 'référence attendue au format REQ-DOMAINE-NNN'))
          .default([]),
        adrs: z
          .array(z.string().regex(ADR_ID_PATTERN, 'référence d’ADR attendue sur 3 chiffres'))
          .default([]),
      })
      .default({ issues: [], requirements: [], adrs: [] }),
  })
  .superRefine((requirement, ctx) => {
    // Ids d'AC strictement séquentiels à partir de AC-1. C'est plus strict que
    // « uniques », et c'est voulu : le nommage des tests (`it('AC-3: …')`) doit
    // désigner un critère sans ambiguïté, y compris après la suppression d'un
    // critère au milieu de la liste.
    requirement.acceptance_criteria.forEach((criterion, index) => {
      const expected = `AC-${index + 1}`
      if (criterion.id !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: ['acceptance_criteria', index, 'id'],
          message: `identifiant « ${criterion.id} » : la numérotation doit être séquentielle (attendu ${expected})`,
        })
      }
    })

    // `implemented` sans trace serait la pire des situations : un statut qui
    // affirme la couverture sans rien pour l'étayer. La matrice de traçabilité
    // le compterait comme couvert.
    if (requirement.status === 'implemented') {
      if (requirement.implementation.files.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['implementation', 'files'],
          message: 'status « implemented » : au moins un fichier d’implémentation est requis',
        })
      }
      if (requirement.implementation.tests.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['implementation', 'tests'],
          message: 'status « implemented » : au moins un fichier de test est requis',
        })
      }
    }
  })

export type Requirement = z.infer<typeof requirementSchema>
