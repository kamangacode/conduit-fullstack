import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

/**
 * Vérification active du harness `apps/web`.
 *
 * Ce n'est pas un test du produit : c'est la preuve que la lane sait faire ce
 * que les tests de composants exigeront d'elle. Trois choses peuvent se
 * désaligner en silence — l'environnement DOM, le rendu React (JSX transformé
 * par le plugin), et les matchers `jest-dom` chargés par `vitest.setup.ts`. Une
 * seule qui manque, et le premier vrai test de composant échoue avec un message
 * qui pointe vers le composant plutôt que vers la configuration.
 *
 * Le composant sondé porte volontairement un **état** : un rendu statique ne
 * prouverait pas que React fonctionne réellement dans cet environnement.
 */
function StatefulProbe(): React.JSX.Element {
  const [count, setCount] = useState(0)
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      compteur : {count}
    </button>
  )
}

describe('harness — environnement de test de apps/web', () => {
  it('rend un composant React avec état dans le DOM', () => {
    render(<StatefulProbe />)

    expect(screen.getByRole('button')).toHaveTextContent('compteur : 0')
  })

  it('nettoie le DOM entre deux tests', () => {
    // Si `cleanup()` n'était pas branché dans vitest.setup.ts, le bouton monté
    // par le test précédent serait encore présent et `getByRole` échouerait sur
    // « found multiple elements ». Ce test échoue donc précisément quand le
    // nettoyage saute — et pas trois suites plus loin.
    render(<StatefulProbe />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
