import { describe, expect, it } from 'vitest'
import { createArticleDtoSchema } from '../model/article'
import { createCommentDtoSchema } from '../model/comment'
import { loginDtoSchema, registerDtoSchema, updateUserDtoSchema } from '../model/user'
import { CONTRACT_MESSAGES } from './contract-messages'
import { toErrorResponse } from './validation-errors'

/**
 * Ce que ces specs prouvent, et pourquoi elles existent au niveau du modèle
 * partagé plutôt qu'au niveau HTTP : le message renvoyé pour un champ vide est
 * une propriété du **schéma**, pas du contrôleur. Le vérifier ici le vérifie une
 * fois pour les deux applications, et rend impossible qu'un endpoint le respecte
 * pendant qu'un autre laisse fuiter le message par défaut de la bibliothèque de
 * validation.
 *
 * Les assertions passent par `toErrorResponse` plutôt que d'inspecter la
 * `ZodError` brute : c'est la forme que le client reçoit réellement, et c'est
 * elle que la suite de conformité interroge.
 */

/** Rend les messages du contrat pour un champ, tels qu'un client les recevrait. */
const messagesFor = (
  result: { success: false; error: Parameters<typeof toErrorResponse>[0] },
  field: string
): string[] => toErrorResponse(result.error).errors[field] ?? []

/** Parse en exigeant l'échec — un `safeParse` réussi ici serait un faux négatif silencieux. */
const expectRejected = <T extends { safeParse: (input: unknown) => { success: boolean } }>(
  schema: T,
  input: unknown
) => {
  const result = schema.safeParse(input) as ReturnType<typeof registerDtoSchema.safeParse>
  expect(result.success).toBe(false)
  if (result.success) {
    throw new Error('schéma attendu en échec')
  }
  return result
}

/**
 * Les champs obligatoires que la suite officielle interroge nommément, chacun
 * dans le schéma qui le porte.
 *
 * La table plutôt qu'une suite d'assertions : le défaut d'origine n'était pas
 * qu'un champ manquait son message, c'est qu'**aucun** ne l'avait. Ce qu'il faut
 * pouvoir lire ici, c'est la liste exhaustive des champs couverts — et y ajouter
 * une ligne quand le contrat en nommera un de plus.
 */
const blankFieldCases = [
  {
    label: 'username à l’inscription',
    schema: registerDtoSchema,
    field: 'username',
    input: { username: '', email: 'a@b.co', password: 'password123' },
  },
  {
    label: 'mot de passe à l’inscription',
    schema: registerDtoSchema,
    field: 'password',
    input: { username: 'u', email: 'a@b.co', password: '' },
  },
  {
    label: 'mot de passe à la connexion',
    schema: loginDtoSchema,
    field: 'password',
    input: { email: 'a@b.co', password: '' },
  },
  {
    label: 'titre d’article',
    schema: createArticleDtoSchema,
    field: 'title',
    input: { title: '', description: 'd', body: 'b' },
  },
  {
    label: 'description d’article',
    schema: createArticleDtoSchema,
    field: 'description',
    input: { title: 't', description: '', body: 'b' },
  },
  {
    label: 'corps d’article',
    schema: createArticleDtoSchema,
    field: 'body',
    input: { title: 't', description: 'd', body: '' },
  },
  {
    label: 'corps de commentaire',
    schema: createCommentDtoSchema,
    field: 'body',
    input: { body: '' },
  },
] as const

describe('REQ-ERROR-002 — messages d’erreur exigés par la suite de conformité', () => {
  it.each(blankFieldCases)(
    'AC-1: rend « can’t be blank » pour le $label reçu vide',
    ({ schema, field, input }) => {
      expect(messagesFor(expectRejected(schema, input), field)[0]).toBe(CONTRACT_MESSAGES.blank)
    }
  )

  it('AC-2: rend « can’t be blank » pour un email vide, et non un motif de format', () => {
    // Le piège exact du défaut d'origine : `z.email()` refuse bien la chaîne
    // vide, mais au motif du **format**. Le contrat veut le motif du vide, ce
    // qui impose que le contrôle de présence passe avant celui de format.
    const messages = messagesFor(
      expectRejected(registerDtoSchema, { username: 'u', email: '', password: 'password123' }),
      'email'
    )

    expect(messages[0]).toBe(CONTRACT_MESSAGES.blank)
    expect(messages).not.toContain(CONTRACT_MESSAGES.emailInvalid)
  })

  it('AC-2: laisse le motif de format à un email non vide mais malformé', () => {
    // Contre-épreuve d'AC-2 : sans elle, un schéma qui répondrait « can't be
    // blank » à *tout* email refusé passerait le test précédent. C'est
    // exactement le raccourci qu'on écrirait en corrigeant vite.
    const messages = messagesFor(
      expectRejected(registerDtoSchema, {
        username: 'u',
        email: 'pas-un-email',
        password: 'password123',
      }),
      'email'
    )

    expect(messages).not.toContain(CONTRACT_MESSAGES.blank)
  })
})

describe('REQ-USER-005 — un champ nullable reçu vide est une absence', () => {
  it('AC-1: normalise une bio vide en null', () => {
    const result = updateUserDtoSchema.parse({ bio: '' })

    expect(result.bio).toBeNull()
  })

  it('AC-3: normalise une image vide en null, exactement comme la bio', () => {
    const result = updateUserDtoSchema.parse({ image: '' })

    expect(result.image).toBeNull()
  })

  it('AC-4: laisse absent ce qui est absent, et intact ce qui porte une valeur', () => {
    // La contrepartie qui empêche la correction de déborder : si la
    // normalisation touchait aussi les champs omis, chaque enregistrement de
    // formulaire deviendrait un effacement partiel. `null` doit rester
    // distinguable de « non transmis » dans le résultat du parse.
    const untouched = updateUserDtoSchema.parse({ username: 'jake' })

    expect('bio' in untouched).toBe(false)
    expect('image' in untouched).toBe(false)

    const kept = updateUserDtoSchema.parse({ bio: 'une bio' })
    expect(kept.bio).toBe('une bio')

    const erased = updateUserDtoSchema.parse({ bio: null })
    expect(erased.bio).toBeNull()
  })

  it('AC-5: refuse un champ obligatoire vide au lieu de le normaliser', () => {
    // L'indulgence est réservée aux champs que le contrat déclare nullables.
    // L'étendre à `username` ou `email` produirait un compte sans nom.
    expectRejected(updateUserDtoSchema, { username: '' })
    expectRejected(updateUserDtoSchema, { email: '' })
  })
})
