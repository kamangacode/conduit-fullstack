import type { ReactNode } from 'react'
import { Navbar } from '../components/Navbar'
import { ApiProvider } from '../lib/api-provider'

export const metadata = {
  title: 'Conduit',
  description: 'A place to share your knowledge — clone RealWorld en full-stack TypeScript.',
}

/**
 * Coquille applicative, markup RealWorld (rule 11).
 *
 * Le layout reste un **Server Component** : seuls les fournisseurs et la barre
 * de navigation sont clients. C'est la frontière de l'ADR 012 appliquée à la
 * racine — le squelette de page est rendu côté serveur, et seul ce qui dépend
 * du lecteur bascule côté client.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiProvider>
          <Navbar />
          {children}
          <footer>
            <div className="container">
              <a href="/" className="logo-font">
                conduit
              </a>
              <span className="attribution">
                An interactive learning project from <a href="https://thinkster.io">Thinkster</a>.
                Code &amp; design licensed under MIT.
              </span>
            </div>
          </footer>
        </ApiProvider>
      </body>
    </html>
  )
}
