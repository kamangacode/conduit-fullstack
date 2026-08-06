import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArticlePageNotice } from './ArticlePageNotice'
import { ProfilePageNotice } from './ProfilePageNotice'

/**
 * Tests écrits depuis les critères de REQ-WEB-018.
 *
 * Les deux coquilles sont éprouvées ici plutôt que par leurs fichiers de route :
 * `not-found.tsx` et `error.tsx` sont des adaptateurs de deux lignes dont le
 * rôle — être placés au bon endroit de l'arborescence — relève du parcours e2e,
 * pas d'un test de composant.
 */

describe('REQ-WEB-018 — coquilles de page quand l’API refuse ou ne répond pas', () => {
  it('AC-1: la page article absente reste une page article', () => {
    const { container } = render(<ArticlePageNotice kind="missing" />)

    expect(container.querySelector('.article-page')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Article not found' })).toBeInTheDocument()
  })

  it('AC-2: l’indisponibilité ne se lit pas comme une absence', () => {
    // Le défaut que ce critère ferme : « cet article n'existe pas » affiché
    // pendant une panne d'API est faux, et il envoie le lecteur conclure que
    // l'auteur a supprimé son article.
    render(<ArticlePageNotice kind="unavailable" />)

    expect(screen.getByRole('heading', { name: 'Article unavailable' })).toBeInTheDocument()
    expect(screen.queryByText(/doesn't exist/)).not.toBeInTheDocument()
  })

  it('AC-3: le profil absent reste une page de profil', () => {
    const { container } = render(<ProfilePageNotice kind="missing" />)

    expect(container.querySelector('.profile-page')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Profile not found' })).toBeInTheDocument()
  })

  it('AC-4: le profil indisponible le dit, sans affirmer que le compte n’existe pas', () => {
    render(<ProfilePageNotice kind="unavailable" />)

    expect(screen.getByRole('heading', { name: 'Profile unavailable' })).toBeInTheDocument()
    expect(screen.queryByText(/No one is registered/)).not.toBeInTheDocument()
  })

  it('AC-5: chaque coquille porte les classes que le contrat de sélecteurs vise', () => {
    const article = render(<ArticlePageNotice kind="unavailable" />).container
    const profile = render(<ProfilePageNotice kind="unavailable" />).container

    expect(article.querySelector('.article-page .banner')).not.toBeNull()
    expect(profile.querySelector('.profile-page')).not.toBeNull()
  })

  it('AC-3: la coquille de profil n’imbrique pas `.user-info`', () => {
    // Le contrat localise cette page par `.profile-page, .user-info`, évalué en
    // **mode strict** : porter les deux fait échouer les trois tests concernés
    // sur « resolved to 2 elements ». La première version portait les deux, pour
    // « garder la forme d'une page de profil » — les tests l'ont contredite.
    const { container } = render(<ProfilePageNotice kind="missing" />)

    expect(container.querySelectorAll('.profile-page, .user-info')).toHaveLength(1)
  })

  it('AC-5: chaque coquille propose un retour vers l’accueil', () => {
    // Sans lui, la page est une impasse : c'est précisément ce que l'écran
    // d'erreur du framework produit, et la raison pour laquelle on ne s'en
    // contente pas.
    render(<ArticlePageNotice kind="missing" />)
    render(<ProfilePageNotice kind="missing" />)

    const links = screen.getAllByRole('link', { name: 'Back to the home page' })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/')
    }
  })
})
