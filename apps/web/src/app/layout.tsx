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
      {/*
       * Chargement du thème RealWorld (spec `specifications/frontend/styles.md`
       * + bloc Head de `templates.md`). Le markup de l'app suit les classes
       * RealWorld (rule 11) ; sans cette feuille, ces classes n'ont aucune règle
       * derrière et la page rend « nue ». Trois ressources, comme la spec :
       *   - `/styles.css` : le thème « Conduit Minimal CSS v4 », **servi depuis
       *     l'app** (vendoré dans `public/`), pas depuis un CDN — la spec l'exige.
       *   - Ionicons v2 : les icônes `ion-*` (compose, gear, heart…) du template.
       *   - Source Sans Pro (corps) + Lora (titres) : les polices du thème, que
       *     `styles.css` ne bundle pas.
       * Ionicons et les polices restent en CDN (fidèle à l'exemple de la spec) ;
       * un éventuel passage au self-host (CSP stricte) fera l'objet d'un ADR.
       *
       * `/theme-overrides.css` vient EN DERNIER, à dessein : il corrige le thème
       * vendoré sans le modifier (voir l'en-tête du fichier). L'ordre porte la
       * sémantique — un override ne surcharge que s'il est chargé après sa cible.
       */}
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/ionicons/2.0.1/css/ionicons.min.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,400,600,700|Lora:400,700&display=swap"
        />
        <link rel="stylesheet" href="/styles.css" />
        <link rel="stylesheet" href="/theme-overrides.css" />
      </head>
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
