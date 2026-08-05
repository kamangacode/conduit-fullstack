'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react'
import { type ApiClient, createApiClient } from './api-client'
import { SessionProvider, useSession } from './session'

/**
 * Câblage client de l'application : cache de requêtes et client API.
 *
 * Deux fournisseurs plutôt qu'un, et dans cet ordre : le client API a besoin de
 * la session pour connaître le jeton, donc la session l'englobe.
 */

/** URL de l'API. Publique par nécessité — le navigateur doit la connaître. */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

const ApiContext = createContext<ApiClient | null>(null)

function ApiClientProvider({ children }: { children: ReactNode }) {
  const { token } = useSession()

  // Le jeton est lu **à chaque requête** via la closure, pas capturé à la
  // construction : un client figé continuerait d'envoyer l'ancien jeton après
  // une reconnexion, et le symptôme serait un 401 sur une session pourtant
  // fraîche. C'est aussi pourquoi `token` n'est pas dans les dépendances du
  // mémo — le client n'a pas besoin d'être reconstruit quand il change.
  const tokenRef = useRef(token)
  tokenRef.current = token

  const client = useMemo(
    () => createApiClient({ baseUrl: API_BASE_URL, getToken: () => tokenRef.current }),
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
