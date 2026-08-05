'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react'
import { type ApiClient, createApiClient } from './api-client'
import { API_BASE_URL } from './env'
import { SessionProvider, useSession } from './session'

/**
 * Câblage client de l'application : cache de requêtes et client API.
 *
 * Deux fournisseurs plutôt qu'un, et dans cet ordre : le client API a besoin de
 * la session pour connaître le jeton, donc la session l'englobe.
 */

const ApiContext = createContext<ApiClient | null>(null)

function ApiClientProvider({ children }: { children: ReactNode }) {
  const { token, signOut } = useSession()

  // Le jeton est lu **à chaque requête** via la closure, pas capturé à la
  // construction : un client figé continuerait d'envoyer l'ancien jeton après
  // une reconnexion, et le symptôme serait un 401 sur une session pourtant
  // fraîche. C'est aussi pourquoi `token` n'est pas dans les dépendances du
  // mémo — le client n'a pas besoin d'être reconstruit quand il change.
  const tokenRef = useRef(token)
  tokenRef.current = token

  // Même raisonnement pour `signOut` : la référence est stable aujourd'hui
  // (`useCallback` sans dépendance), mais la lire par ref rend le client
  // indépendant de cette garantie.
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE_URL,
        getToken: () => tokenRef.current,
        // C'est ici que l'API redevient seule autorité sur la validité du
        // jeton (REQ-WEB-002 AC-4) : elle répond 401, la session se purge.
        onUnauthorized: () => signOutRef.current(),
      }),
    []
  )

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

/**
 * Racine cliente, posée une fois par le layout.
 *
 * `useState` pour le `QueryClient` et non une constante de module : un client
 * partagé entre plusieurs rendus serveur ferait fuiter le cache d'un visiteur
 * vers un autre. La fonction d'initialisation garantit une instance par arbre.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Le contenu Conduit change peu à l'échelle d'une navigation ;
            // refetch systématique au focus produirait surtout du bruit réseau.
            refetchOnWindowFocus: false,
            retry: 1,
            /**
             * **Sans ce réglage, le préchargement de l'ADR 015 ne sert à rien.**
             *
             * Le défaut de TanStack Query est `staleTime: 0` : les données
             * transmises par `HydrationBoundary` sont donc considérées comme
             * périmées à l'instant même où le composant monte, et `useQuery`
             * refait aussitôt la requête que le serveur venait d'épargner. Le
             * HTML initial restait complet — c'est pourquoi le défaut ne se
             * voyait pas — mais l'économie d'aller-retour annoncée par l'ADR
             * était fausse, et trois commentaires du dépôt l'affirmaient.
             *
             * Trente secondes : assez pour couvrir l'hydratation et une
             * navigation immédiate, assez court pour qu'un retour sur la page
             * quelques minutes plus tard revalide. Ce n'est pas un cache de
             * fraîcheur — les mutations mettent l'affichage à jour depuis la
             * réponse de l'API, sans attendre un refetch.
             */
            staleTime: 30_000,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ApiClientProvider>{children}</ApiClientProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}

/** Client API de la session courante. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext)

  if (!client) {
    throw new Error(
      'useApi est appelé hors de ApiProvider : le composant doit être rendu sous ' +
        'le fournisseur posé par le layout racine.'
    )
  }

  return client
}
