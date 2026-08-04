import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Amorçage commun de la lane de test `apps/web`.
 *
 * `cleanup()` après chaque test n'est pas une précaution de confort : sans lui,
 * les composants montés s'accumulent dans le même document et les requêtes de
 * Testing Library (`getByRole`, `getByText`) commencent à trouver plusieurs
 * correspondances. Le symptôme apparaît alors dans un test qui n'a rien fait de
 * mal — celui qui s'exécute après le coupable.
 */
afterEach(() => {
  cleanup()
})
