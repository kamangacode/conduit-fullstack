'use client'

import { type User, userSchema } from '@repo/shared'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * Session côté client (REQ-WEB-002, [ADR 012]).
 *
 * L'ADR 012 place délibérément la session **hors du serveur** : ni cookie, ni
 * session serveur, un jeton qui ne quitte pas le navigateur. Ce fichier en est
 * la conséquence directe, et sa difficulté tient à un seul point — le rendu
 * serveur ne connaît pas `localStorage`.
 *
 * D'où la règle qui structure tout ce qui suit : **le stockage n'est lu
 * qu'après montage**. Le lire pendant le rendu produirait un arbre différent de
 * celui rendu par le serveur, et React signalerait une divergence
 * d'hydratation — un avertissement qu'on apprend vite à ignorer, et qui masque
 * ensuite les vrais. Le prix est l'état anonyme transitoire que l'ADR assume.
 *
 * Un contexte React et non une bibliothèque d'état : deux valeurs, posées une
 * fois, rarement modifiées. Zustand n'apporterait ici qu'une dépendance
 * (ADR 012, rule 10 amendée).
 */

/** Clé de stockage. Exportée pour que les tests décrivent l'état initial sans la deviner. */
export const SESSION_STORAGE_KEY = 'conduit.session'

interface SessionState {
  /** Compte courant, ou `null` si anonyme. */
  readonly user: User | null
  /** Jeton courant, ou `null`. Dérivé de `user`, jamais stocké séparément. */
  readonly token: string | null
  /** Ouvre la session à partir de la réponse `User` d'une connexion ou d'une inscription. */
  signIn(user: User): void
  /** Ferme la session et efface le stockage. */
  signOut(): void
}

const SessionContext = createContext<SessionState | null>(null)

/**
 * Relit la session persistée.
 *
 * Le contenu est validé par le schéma partagé plutôt que transtypé : un
 * stockage écrit par une version antérieure du format, ou tronqué par une
 * écriture interrompue, produirait sinon un `User` incomplet qui casserait
 * l'interface loin de sa cause. En cas d'échec on repart anonyme, et on purge —
 * garder une valeur qu'on refuse de lire ne sert à rien.
 */
function readPersistedSession(): User | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = userSchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      return parsed.data
    }
  } catch {
    // JSON illisible : on retombe sur l'état anonyme.
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
  return null
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // Toujours `null` au premier rendu — donc identique au rendu serveur.
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    setUser(readPersistedSession())
  }, [])

  const signIn = useCallback((next: User) => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
    setUser(next)
  }, [])

  const signOut = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    setUser(null)
  }, [])

  const value = useMemo<SessionState>(
    () => ({ user, token: user?.token ?? null, signIn, signOut }),
    [user, signIn, signOut]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Accès à la session.
 *
 * Le `throw` attrape une erreur de **câblage**, pas une erreur d'utilisateur :
 * un composant client monté hors du fournisseur. Sans lui, la valeur serait
 * `null` et le symptôme apparaîtrait bien plus loin, sous la forme d'une
 * interface obstinément anonyme dont rien n'expliquerait la cause.
 */
export function useSession(): SessionState {
  const session = useContext(SessionContext)

  if (!session) {
    throw new Error(
      'useSession est appelé hors de SessionProvider : le composant doit être rendu ' +
        'sous le fournisseur posé par le layout racine.'
    )
  }

  return session
}
