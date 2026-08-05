import Link from 'next/link'
import { createServerApiClient } from '../lib/server-api-client'

/**
 * Barre latérale des tags populaires (REQ-WEB-009 AC-6), markup RealWorld.
 *
 * **Server Component** : la liste des tags est identique pour tout le monde
 * (ADR 012), donc elle est rendue côté serveur, sans jeton.
 *
 * Sa propriété la moins évidente est la **résilience**. Cette barre est
 * décorative pour le parcours : un échec de `GET /tags` ne doit pas empêcher de
 * lire les articles. Ce n'est pas automatique — une erreur non rattrapée dans un
 * Server Component fait échouer le rendu de toute la page, et la panne d'un
 * élément accessoire emporterait alors l'essentiel.
 */
export async function PopularTags() {
  const tags = await fetchTags()

  return (
    <div className="sidebar">
      <p>Popular Tags</p>

      <div className="tag-list">
        {tags.map((tag) => (
          <Link className="tag-pill tag-default" href={`/tag/${encodeURIComponent(tag)}`} key={tag}>
            {tag}
          </Link>
        ))}
      </div>
    </div>
  )
}

/**
 * Charge les tags, ou rend une liste vide.
 *
 * L'erreur est avalée **délibérément**, et c'est le seul endroit du dépôt où
 * c'est le cas : partout ailleurs une panne d'API remonte, pour ne pas déguiser
 * un incident en résultat vide. Ici l'arbitrage s'inverse, parce que l'élément
 * est accessoire et que le coût de l'échec — une page d'accueil entièrement
 * indisponible — est sans commune mesure avec celui de son absence.
 *
 * L'anonymat du serveur et l'absence de cache HTTP viennent de
 * `createServerApiClient` : la liste bouge à chaque publication d'article, et
 * une version figée proposerait des tags qui ne mènent nulle part.
 */
async function fetchTags(): Promise<readonly string[]> {
  try {
    return await createServerApiClient().getTags()
  } catch {
    return []
  }
}
