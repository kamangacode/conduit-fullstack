import { ArticleEditor } from '../../components/ArticleEditor'

/**
 * Route `/editor` — rédaction d'un nouvel article.
 *
 * La page est vide de logique : l'éditeur est le même en création et en
 * modification, et c'est la présence de l'article qui les distingue.
 */
export const metadata = { title: 'New Article — Conduit' }

export default function Page() {
  return <ArticleEditor />
}
