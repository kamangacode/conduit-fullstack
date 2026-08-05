'use client'

import { type UpdateUserDto, type User, updateUserDtoSchema } from '@repo/shared'
import { type FormEvent, useState } from 'react'
import { toMessages } from '../lib/errors'
import { ErrorMessages } from './ErrorMessages'

/**
 * Formulaire de paramètres (REQ-WEB-004), markup RealWorld (rule 11).
 *
 * Comme `AuthForm`, il ne connaît pas l'API : la page lui fournit `onSave`.
 *
 * Sa subtilité tient en une règle — **un champ vide n'est pas une valeur, c'est
 * une absence**. Le contrat traite la mise à jour comme partielle : une clé
 * absente signifie « ne pas toucher » (REQ-USER-004). Envoyer les champs
 * inchangés reviendrait à réécrire à l'identique, et envoyer le mot de passe
 * vide — qui l'est toujours à l'ouverture — l'écraserait à chaque
 * enregistrement.
 */

export interface SettingsFormProps {
  readonly user: User
  /** Enregistrement effectif. Ne reçoit que les champs réellement modifiés. */
  onSave(changes: UpdateUserDto): Promise<void>
  onSignOut(): void
}

export function SettingsForm({ user, onSave, onSignOut }: SettingsFormProps) {
  // `?? ''` : `bio` et `image` sont nullables (ADR 004), et `value={null}`
  // rendrait le champ non contrôlé — React s'en plaint à la première frappe.
  const [image, setImage] = useState(user.image ?? '')
  const [username, setUsername] = useState(user.username)
  const [bio, setBio] = useState(user.bio ?? '')
  const [email, setEmail] = useState(user.email)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors([])
    setPending(true)

    const failures = await save(user, { image, username, bio, email, password }, onSave)

    setPending(false)
    setErrors(failures)
    if (failures.length === 0) {
      // Le champ est vidé après succès : le garder rempli laisserait croire que
      // le mot de passe sera renvoyé au prochain enregistrement.
      setPassword('')
    }
  }

  return (
    <div className="settings-page">
      <div className="container page">
        <div className="row">
          <div className="col-md-6 offset-md-3 col-xs-12">
            <h1 className="text-xs-center">Your Settings</h1>

            <ErrorMessages messages={errors} />

            <form onSubmit={handleSubmit}>
              <fieldset>
                <Field
                  className="form-control"
                  placeholder="URL of profile picture"
                  value={image}
                  onChange={setImage}
                />
                <Field placeholder="Your Name" value={username} onChange={setUsername} />
                <fieldset className="form-group">
                  <textarea
                    aria-label="Short bio about you"
                    className="form-control form-control-lg"
                    rows={8}
                    placeholder="Short bio about you"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                  />
                </fieldset>
                <Field placeholder="Email" value={email} onChange={setEmail} />
                <Field
                  placeholder="New Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                <button
                  className="btn btn-lg btn-primary pull-xs-right"
                  type="submit"
                  disabled={pending}
                >
                  Update Settings
                </button>
              </fieldset>
            </form>

            <hr />
            <button className="btn btn-outline-danger" type="button" onClick={onSignOut}>
              Or click here to logout.
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Valide puis enregistre, et rend les messages d'échec — vide en cas de succès.
 *
 * Extraite du composant pour le garder sous la limite de lignes (rule 17), et
 * parce que la séquence « ne retenir que les changements → valider → envoyer →
 * traduire l'échec » se lit mieux d'un bloc que dispersée dans un gestionnaire
 * d'événement.
 */
async function save(
  user: User,
  values: FormValues,
  onSave: (changes: UpdateUserDto) => Promise<void>
): Promise<string[]> {
  const parsed = updateUserDtoSchema.safeParse(collectChanges(user, values))

  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`)
  }

  try {
    await onSave(parsed.data)
    return []
  } catch (error) {
    // Un 401 ici signifie « votre session a expiré », pas « la requête a
    // échoué » : c'est la divergence que la copie locale de `toMessages` avait
    // introduite, et que la table partagée referme.
    return toMessages(error, SETTINGS_MESSAGES)
  }
}

/** Messages génériques propres à cette page (voir `lib/errors.ts`). */
const SETTINGS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'your session has expired, please sign in again',
  500: 'something went wrong, please try again',
}

/**
 * Champ de saisie du markup RealWorld.
 *
 * Extrait pour garder le composant sous la limite de lignes (rule 17). La
 * bio garde son propre `textarea` : c'est le seul champ multiligne, et le
 * paramétrer aurait produit une abstraction à deux formes pour un seul usage.
 */
function Field({
  placeholder,
  value,
  onChange,
  type = 'text',
  className = 'form-control form-control-lg',
}: {
  placeholder: string
  value: string
  onChange(next: string): void
  type?: 'text' | 'password'
  className?: string
}) {
  return (
    <fieldset className="form-group">
      {/* Voir `AuthForm` : le placeholder ne tient pas lieu de nom accessible. */}
      <input
        aria-label={placeholder}
        className={className}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </fieldset>
  )
}

/** Valeurs saisies, avant comparaison avec le compte courant. */
interface FormValues {
  readonly image: string
  readonly username: string
  readonly bio: string
  readonly email: string
  readonly password: string
}

/**
 * Ne retient que ce qui a **changé**.
 *
 * Deux raisons, et la seconde est la moins évidente :
 *
 * 1. Réécrire un champ inchangé écraserait une modification faite entre-temps
 *    depuis un autre onglet.
 * 2. Le mot de passe est **toujours vide** à l'ouverture (l'API ne le renvoie
 *    pas, R-9). Le comparer à sa valeur initiale — la chaîne vide — le retire
 *    donc naturellement de la requête tant que l'utilisateur n'en saisit pas un
 *    nouveau. C'est la même règle qui traite les deux cas, pas une exception.
 */
function collectChanges(user: User, values: FormValues): UpdateUserDto {
  const initial: FormValues = {
    image: user.image ?? '',
    username: user.username,
    bio: user.bio ?? '',
    email: user.email,
    password: '',
  }

  return {
    ...(values.image === initial.image ? {} : { image: values.image }),
    ...(values.username === initial.username ? {} : { username: values.username }),
    ...(values.bio === initial.bio ? {} : { bio: values.bio }),
    ...(values.email === initial.email ? {} : { email: values.email }),
    ...(values.password === initial.password ? {} : { password: values.password }),
  }
}
