import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArticleBody } from './ArticleBody'

/** Tests écrits depuis les critères de REQ-WEB-012, avant l'implémentation. */

describe('REQ-WEB-012 — corps d’article en Markdown', () => {
  it('AC-2: applique la mise en forme au lieu d’afficher la syntaxe', () => {
    const { container } = render(
      <ArticleBody body={'# Titre\n\nUn paragraphe avec de l’**emphase**.'} />
    )

    expect(container.querySelector('h1')).toHaveTextContent('Titre')
    expect(container.querySelector('strong')).toHaveTextContent('emphase')
    // Si le Markdown n'était pas interprété, la syntaxe resterait visible.
    expect(container.textContent).not.toContain('**')
  })

  it('AC-2: rend les listes et les liens', () => {
    const { container } = render(
      <ArticleBody body={'- un\n- deux\n\n[RealWorld](https://realworld.how)'} />
    )

    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'RealWorld' })).toHaveAttribute(
      'href',
      'https://realworld.how'
    )
  })

  it('AC-3: n’interprète pas une balise de script contenue dans le corps', () => {
    // Le cœur de l'ADR 013. Le jeton vit dans le stockage local : un XSS stocké
    // ici n'abîmerait pas l'affichage, il exfiltrerait la session de chaque
    // lecteur.
    const { container } = render(
      <ArticleBody body={'<script>window.__pwned = true</script>Texte'} />
    )

    expect(container.querySelector('script')).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('AC-3: n’interprète pas non plus un gestionnaire d’événement inline', () => {
    // Le vecteur qui survit à un filtrage naïf de `<script>` : une image
    // cassée dont le `onerror` s'exécute au chargement.
    const { container } = render(
      <ArticleBody body={'<img src="x" onerror="window.__pwned = true">'} />
    )

    expect(container.querySelector('img')).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('AC-3: le HTML brut est rendu inoffensif, pas silencieusement exécuté', () => {
    // La propriété n'est pas « le HTML disparaît » mais « il ne devient jamais
    // du balisage ». On l'éprouve sur une balise anodine : si elle produisait un
    // élément, alors `<script>` en produirait un aussi.
    const { container } = render(<ArticleBody body={'<b>gras ?</b>'} />)

    expect(container.querySelector('b')).toBeNull()
  })
})
