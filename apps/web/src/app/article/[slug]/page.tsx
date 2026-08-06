import type { Article, Comment } from '@repo/shared'
import { notFound } from 'next/navigation'
import { ArticleBody } from '../../../components/ArticleBody'
import { ArticleMeta } from '../../../components/ArticleMeta'
import { CommentSection } from '../../../components/CommentSection'
import { ApiError } from '../../../lib/api-client'
import { createServerApiClient } from '../../../lib/server-api-client'

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
  try {
    return await createServerApiClient().getArticle(slug)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * Titre de l'onglet.
 *
 * L'échec est avalé **ici et pas dans la page** (REQ-WEB-018 AC-2) : le titre
 * est produit avant le rendu, donc une exception levée à cet endroit précède la
 * frontière d'erreur du segment et emporterait la coquille avec elle. La page,
 * elle, laisse remonter — c'est ce qui déclenche `error.tsx`.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  try {
    const article = await fetchArticle(slug)
    return { title: article ? `${article.title} — Conduit` : 'Article introuvable — Conduit' }
  } catch {
    return { title: 'Article indisponible — Conduit' }
  }
}

/**
 * Charge les commentaires, ou rend une liste vide.
 *
 * Même arbitrage que la barre des tags, et pour la même raison : une erreur non
 * rattrapée dans un Server Component fait échouer le rendu de **toute la page**,
 * et l'indisponibilité des commentaires emporterait l'article, qui est
 * l'essentiel. Le composant client reprendra la main pour toute évolution.
 */
async function fetchComments(slug: string): Promise<Comment[]> {
  try {
    return await createServerApiClient().getComments(slug)
  } catch {
    return []
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await fetchArticle(slug)

  if (!article) {
    notFound()
  }

  // Après le `notFound` : inutile de charger les commentaires d'un article qui
  // n'existe pas.
  const comments = await fetchComments(article.slug)

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

        {/* Les commentaires sont chargés côté serveur — ils sont publics — puis
            confiés à un composant client qui les fait évoluer sans quitter la
            page (REQ-WEB-013). */}
        {/* `key` sur le slug : la section copie ses commentaires dans un état
            local, et App Router peut réconcilier la même instance en naviguant
            d'un article à l'autre sur cette route dynamique. Sans elle, les
            commentaires du précédent resteraient affichés. Aucun lien
            article-à-article n'existe aujourd'hui — c'est justement le moment
            de la poser, avant que le premier ne rende le défaut atteignable. */}
        <CommentSection key={article.slug} slug={article.slug} initialComments={comments} />
      </div>
    </div>
  )
}
