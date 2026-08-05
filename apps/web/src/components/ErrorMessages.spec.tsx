import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorMessages } from './ErrorMessages'

/**
 * La garde de ce composant — ne rien rendre quand il n'y a rien à dire — était
 * supprimable sans faire échouer un seul test : les formulaires n'assertent la
 * liste qu'une fois une erreur injectée, jamais son absence. C'est le cas
 * d'école du test qui manque parce que personne ne pense à vérifier le vide.
 */
describe('REQ-WEB-003 — liste d’erreurs', () => {
  it('AC-4: ne rend aucune liste quand il n’y a pas d’erreur', () => {
    const { container } = render(<ErrorMessages messages={[]} />)

    // Une `<ul>` vide occuperait de l'espace et serait annoncée comme une liste
    // par les lecteurs d'écran, sur une page sans le moindre problème.
    expect(container.querySelector('ul.error-messages')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  it('AC-4: rend un élément par message, dans l’ordre reçu', () => {
    const { container } = render(
      <ErrorMessages messages={["email can't be blank", 'password is too short']} />
    )

    const items = [...container.querySelectorAll('ul.error-messages > li')]
    expect(items.map((item) => item.textContent)).toEqual([
      "email can't be blank",
      'password is too short',
    ])
  })
})
