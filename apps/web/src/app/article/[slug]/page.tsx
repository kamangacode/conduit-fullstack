import type { Article } from '@repo/shared'
import { notFound } from 'next/navigation'
import { ArticleBody } from '../../../components/ArticleBody'
import { ArticleMeta } from '../../../components/ArticleMeta'
import { ApiError, createApiClient } from '../../../lib/api-client'
import { API_BASE_URL } from '../../../lib/env'

/**
 * Page article (REQ-WEB-012, route `/article/:slug`).
 *
 * **Server Component** : le contenu — titre, corps, tags, auteur — est
 * identique pour tout le monde, donc rendu côté serveur et indexable
 * (ADR 012). Seules la méta et ses actions dépendent du lecteur et basculent
 * côté client, ce qui les fait apparaître **deux fois** comme dans le template.
 *
 * L'appel part **sans jeton** : `favorited` et `following` valent donc `false`
 * dans ce premier rendu, ce que la règle R-5 prescrit pour un lecteur non
 * identifié — ce n'est pas un pis-aller.
 */

/**
 * Charge l'article, ou `null` s'il n'existe pas.
 *
 * Un 404 est un **résultat attendu** ; toute autre erreur remonte. Les
 * confondre afficherait « cet article n'existe pas » pendant une panne d'API —
 * un message faux, au moment où il coûte le plus cher au lecteur (AC-8).
 */
async function fetchArticle(slug: string): Promise<Article | null> {
  const client = createApiClient({
    baseUrl: API_BASE_URL,
    getToken: () => null,
    fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  })

  try {
    return await client.getArticle(slug)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await fetchArticle(slug)

  return { title: article ? `${article.title} — Conduit` : 'Article introuvable — Conduit' }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await fetchArticle(slug)

  if (!article) {
    notFound()
  }

  return (
    <div className="article-page">
      <div className="banner">
        <div className="container">
          <h1>{article.title}</h1>
          <ArticleMeta article={article} />
        </div>
      </div>

      <div className="container page">
        <div className="row article-content">
          <div className="col-md-12">
            <ArticleBody body={article.body} />
            <ul className="tag-list">
              {article.tagList.map((tag) => (
                <li className="tag-default tag-pill tag-outline" key={tag}>
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <hr />

        {/* Le template répète la méta après le corps : c'est là que le lecteur
            arrive en finissant l'article, donc là qu'il décide de suivre
            l'auteur ou de favoriser. Le composant est le même — deux copies
            divergeraient. */}
        <div className="article-actions">
          <ArticleMeta article={article} />
        </div>

        {/* Les commentaires occupent la fin de cette page et font l'objet d'une
            exigence propre : cycle de vie, autorisations et section de template
            distincts. */}
      </div>
    </div>
  )
}
