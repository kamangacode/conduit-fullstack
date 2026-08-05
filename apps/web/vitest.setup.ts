import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

/**
 * Amorçage commun de la lane de test `apps/web`.
 *
 * `cleanup()` après chaque test n'est pas une précaution de confort : sans lui,
 * les composants montés s'accumulent dans le même document et les requêtes de
 * Testing Library (`getByRole`, `getByText`) commencent à trouver plusieurs
 * correspondances. Le symptôme apparaît alors dans un test qui n'a rien fait de
 * mal — celui qui s'exécute après le coupable.
 */

/**
 * Rétablit un `localStorage` conforme au Web Storage.
 *
 * **Node 25 définit son propre `globalThis.localStorage`**, inutilisable tant
 * qu'aucun `--localstorage-file` valide n'est fourni. Comme l'environnement
 * jsdom de Vitest n'écrase pas un global déjà présent, c'est ce stub qui gagne :
 * `window.localStorage` vaut alors `{}` alors que `window.sessionStorage` est,
 * lui, un vrai `Storage` jsdom. L'asymétrie est le meilleur indice — et le
 * message d'erreur, « clear is not a function », désigne le test plutôt que le
 * runtime.
 *
 * On installe donc une implémentation conforme. Ce n'est pas une simulation
 * destinée à contourner la persistance : les sémantiques réelles de
 * `setItem`/`getItem`/`removeItem`/`clear` sont respectées, y compris la
 * conversion en chaîne des valeurs. Les tests de session éprouvent donc bien ce
 * qu'ils prétendent éprouver (REQ-WEB-002).
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.entries.delete(key)
  }

  setItem(key: string, value: string): void {
    // Le Web Storage convertit en chaîne : un test qui poserait un nombre doit
    // relire une chaîne, comme dans un navigateur.
    this.entries.set(String(key), String(value))
  }
}

const installStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

installStorage()

// Une instance neuve par test : le stockage est un état global, et un test qui
// hérite de celui du précédent échoue selon l'ordre d'exécution.
beforeEach(() => {
  installStorage()
})

afterEach(() => {
  cleanup()
})
