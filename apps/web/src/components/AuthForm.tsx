'use client'

import { type LoginDto, loginDtoSchema, type RegisterDto, registerDtoSchema } from '@repo/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { ApiError } from '../lib/api-client'

/**
 * Formulaire d'authentification (REQ-WEB-003), markup RealWorld (rule 11).
 *
 * Un seul composant pour la connexion et l'inscription : les deux partagent
 * leur markup, leur gestion d'erreurs et leur effet — ouvrir une session. Les
 * séparer aurait dupliqué tout cela pour une différence d'un champ.
 *
 * Il ne connaît pas l'API : `onSubmit` lui est fourni par la page. C'est ce qui
 * le rend testable sans réseau et ce qui garde ici la seule responsabilité qui
 * lui revient — saisir, valider, afficher.
 */

/**
 * Messages génériques, indexés par statut.
 *
 * Le **401** est le cas qui compte : l'API répond volontairement la même chose
 * pour un email inconnu et un mot de passe erroné, afin de ne pas devenir un
 * oracle d'existence de comptes (REQ-USER-003 AC-3). Afficher ici « ce compte
 * n'existe pas » rouvrirait la fuite que l'API a fermée — la propriété ne tient
 * que si les deux bouts la respectent.
 */
const GENERIC_MESSAGES: Record<number, string> = {
  401: 'email or password is invalid',
  500: 'something went wrong, please try again',
}

export interface AuthFormProps {
  readonly mode: 'login' | 'register'
  /** Soumission effective. Fournie par la page, qui seule connaît l'API. */
  onSubmit(credentials: LoginDto | RegisterDto): Promise<void>
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const router = useRouter()
  const isRegister = mode === 'register'

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors([])

    // Validation par le schéma **partagé** : exactement la règle que l'API
    // appliquerait, exécutée plus tôt. Réimplémenter les règles ici ferait
    // diverger les deux au premier changement.
    const parsed = isRegister
      ? registerDtoSchema.safeParse({ username, email, password })
      : loginDtoSchema.safeParse({ email, password })

    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`))
      return
    }

    setPending(true)
    try {
      await onSubmit(parsed.data)
      router.push('/')
    } catch (error) {
      setErrors(toMessages(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="container page">
        <div className="row">
          <div className="col-md-6 offset-md-3 col-xs-12">
            <h1 className="text-xs-center">{isRegister ? 'Sign up' : 'Sign in'}</h1>
            <p className="text-xs-center">
              <Link href={isRegister ? '/login' : '/register'}>
                {isRegister ? 'Have an account?' : 'Need an account?'}
              </Link>
            </p>

            <ErrorMessages messages={errors} />

            <form onSubmit={handleSubmit}>
              {isRegister && (
                <TextField
                  placeholder="Username"
                  type="text"
                  value={username}
                  onChange={setUsername}
                />
              )}
              <TextField placeholder="Email" type="text" value={email} onChange={setEmail} />
              <TextField
                placeholder="Password"
                type="password"
                value={password}
                onChange={setPassword}
              />
              {/* Désactivé pendant l'envoi : sans cette garde, un double clic
                  produit deux inscriptions, et la seconde échoue en 409 —
                  l'utilisateur voit une erreur alors que son compte existe. */}
              <button
                className="btn btn-lg btn-primary pull-xs-right"
                type="submit"
                disabled={pending}
              >
                {isRegister ? 'Sign up' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Champ de saisie du markup RealWorld (`.form-group` / `.form-control-lg`).
 *
 * Extrait pour garder `AuthForm` sous la limite de lignes (rule 17), et parce
 * que les trois champs ne diffèrent que par trois valeurs : les écrire trois
 * fois invitait à en modifier un et pas les autres.
 */
function TextField({
  placeholder,
  type,
  value,
  onChange,
}: {
  placeholder: string
  type: 'text' | 'password'
  value: string
  onChange(next: string): void
}) {
  return (
    <fieldset className="form-group">
      <input
        className="form-control form-control-lg"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </fieldset>
  )
}

/** Liste d'erreurs `.error-messages`, telle que le front de référence l'affiche. */
function ErrorMessages({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) {
    return null
  }

  return (
    <ul className="error-messages">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}

/**
 * Traduit une erreur en messages affichables.
 *
 * Les erreurs par champ du contrat (§10) sont affichées telles quelles — elles
 * sont rédigées pour l'utilisateur. Un statut sans détail retombe sur un
 * message générique ; une erreur non-API (réseau coupé) aussi, car elle ne dit
 * rien que l'utilisateur puisse corriger.
 */
function toMessages(error: unknown): string[] {
  if (error instanceof ApiError) {
    const detailed = error.messages
    if (detailed.length > 0) {
      return detailed
    }
    return [GENERIC_MESSAGES[error.status] ?? 'request failed']
  }

  return ['unable to reach the server']
}
