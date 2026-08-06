'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApi } from '../lib/api-provider'
import { useSession } from '../lib/session'

/**
 * Bascule de favori (REQ-WEB-011 AC-2 à AC-6, REQ-WEB-012 AC-9).
 *
 * Extraite d'`ArticlePreview` le jour où la page article en a eu besoin :
 * deux copies de cette logique auraient divergé sur le point qui coûte le plus
 * cher — la provenance du compteur.
 *
 * Deux partis pris tenus par des tests :
 *
 * 1. **L'état vient de la réponse**, jamais d'un incrément local. Une bascule
 *    optimiste est le réflexe naturel et produit une dérive silencieuse : au
 *    premier échec, l'affichage et la base cessent de dire la même chose et
 *    rien ne les resynchronise avant un rechargement.
 * 2. **La classe porte l'état** — `btn-outline-primary` non favorisé,
 *    `btn-primary` favorisé. Ce n'est pas cosmétique : c'est ainsi que le
 *    contrat de sélecteurs E2E *définit* l'état, donc les inverser produirait
 *    une interface qui a l'air juste et une suite de tests qui affirme le
 *    contraire de la réalité.
 *
 * Le **libellé** dépend de l'endroit, et le contrat le décrit ainsi : la liste
 * n'affiche que le cœur et le compteur, la page article ajoute un libellé et met
 * le compteur entre parenthèses. C'est la seule différence entre les deux
 * usages, d'où une variante plutôt que deux composants.
 *
 * Sur la page article, ce libellé **suit l'état** — « Favorite Article » tant
 * que l'article ne l'est pas, « Unfavorite Article » dès qu'il l'est
 * (REQ-WEB-012 AC-10 à AC-12). Ce fichier a affirmé l'inverse, au motif que le
 * gabarit RealWorld ne changerait que la classe : le gabarit ne montre que
 * l'état non favorisé, il ne pouvait donc ni confirmer ni infirmer, et c'est le
 * contrat de sélecteurs qui tranche — il liste `Favorite` / `Unfavorite` comme
 * texte de bouton sur cette page. Le libellé figé rendait le bouton introuvable
 * **après** le premier clic pour qui cherche « Unfavorite ».
 */

export interface FavoriteButtonProps {
  readonly slug: string
  readonly favorited: boolean
  readonly favoritesCount: number
  /**
   * `compact` en liste (cœur + compteur), `labelled` sur la page article
   * (libellé du contrat, fonction de l'état, + compteur entre parenthèses).
   */
  readonly variant?: 'compact' | 'labelled'
  onToggled(next: { favorited: boolean; favoritesCount: number }): void
}

export function FavoriteButton({
  slug,
  favorited,
  favoritesCount,
  variant = 'compact',
  onToggled,
}: FavoriteButtonProps) {
  const api = useApi()
  const router = useRouter()
  const { user, status } = useSession()
  const [pending, setPending] = useState(false)

  async function toggle() {
    // Anonyme : on conduit à la connexion plutôt que de laisser partir un appel
    // qui reviendrait en 401 (REQ-WEB-011 AC-5).
    if (!user) {
      router.push('/login')
      return
    }

    setPending(true)
    try {
      const updated = favorited
        ? await api.unfavoriteArticle(slug)
        : await api.favoriteArticle(slug)
      onToggled(updated)
    } catch {
      // L'échec laisse l'état inchangé (AC-6). Sans ce `catch`, le rejet
      // remonterait non traité et le compteur afficherait une valeur que
      // l'API n'a jamais confirmée.
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      className={`btn btn-sm ${variant === 'compact' ? 'pull-xs-right ' : ''}${
        favorited ? 'btn-primary' : 'btn-outline-primary'
      }`}
      type="button"
      onClick={toggle}
      // Désactivé tant que la session n'est pas résolue : cliquer pendant la
      // réhydratation prendrait le lecteur pour un anonyme et l'enverrait à la
      // connexion alors qu'il a une session valide.
      disabled={pending || status === 'pending'}
    >
      {variant === 'compact' ? (
        <>
          <i className="ion-heart" /> {favoritesCount}
        </>
      ) : (
        <>
          {/* Le libellé vient du contrat de sélecteurs et **suit l'état**, comme
              la classe : `Favorite Article` non favorisé, `Unfavorite Article`
              favorisé. Il se lit donc dans les deux sens — le bouton reste
              trouvable pour qui cherche « Favorite » comme pour qui cherche
              « Unfavorite », et c'est la classe qui désambiguïse, le second
              contenant le premier en sous-chaîne. */}
          <i className="ion-heart" /> {favorited ? 'Unfavorite' : 'Favorite'} Article{' '}
          <span className="counter">({favoritesCount})</span>
        </>
      )}
    </button>
  )
}
