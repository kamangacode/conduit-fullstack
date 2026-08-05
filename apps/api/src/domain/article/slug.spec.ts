import { describe, expect, it } from 'vitest'
import { Slug } from './slug'

/**
 * Tests unitaires du domaine : zéro mock, zéro I/O (rule 16). Le slug est du
 * TypeScript pur — c'est justement pourquoi la règle R-1 est vérifiable sans
 * base de données, et pourquoi l'unicité, elle, ne l'est pas ici (ADR 010).
 */

describe('REQ-ARTICLE-003 — dérivation du slug depuis le titre', () => {
  it('AC-2: met le titre en kebab-case', () => {
    expect(Slug.fromTitle('How to train your dragon').value).toBe('how-to-train-your-dragon')
  })

  it('AC-2: retire la ponctuation plutôt que de la transcrire', () => {
    expect(Slug.fromTitle('Did you train your dragon?!').value).toBe('did-you-train-your-dragon')
  })

  it('AC-2: translittère les accents au lieu de les traiter en séparateurs', () => {
    // Le mode de panne que ce test ferme : sans décomposition NFD, « é » n'est
    // ni [a-z] ni [0-9], donc remplacé par un tiret — « Élevé » donnerait
    // « l-ev », un slug qui ne ressemble plus au titre.
    expect(Slug.fromTitle('Élevé au château').value).toBe('eleve-au-chateau')
  })

  it('AC-2: réduit les séparateurs consécutifs à un seul', () => {
    expect(Slug.fromTitle('Dragons   &&&   Training').value).toBe('dragons-training')
  })

  it('AC-2: ne laisse pas de tiret aux extrémités', () => {
    const slug = Slug.fromTitle('  ...Dragons!  ').value

    expect(slug).toBe('dragons')
    expect(slug.startsWith('-')).toBe(false)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('AC-2: retombe sur un slug adressable quand le titre n’a rien de slugifiable', () => {
    // Un slug vide produirait la route « /api/articles/ », qui n'existe pas :
    // l'article serait créé et définitivement inatteignable.
    expect(Slug.fromTitle('日本語').value).toBe('article')
    expect(Slug.fromTitle('???').value).toBe('article')
  })

  it('AC-3: produit le même candidat pour deux titres identiques', () => {
    // C'est la prémisse de la résolution d'unicité, pas un défaut : le domaine
    // propose, la contrainte de la base arbitre (ADR 010).
    const first = Slug.fromTitle('How to train your dragon')
    const second = Slug.fromTitle('How to train your dragon')

    expect(first.equals(second)).toBe(true)
  })

  it('AC-3: décline un candidat suffixé pour la tentative suivante', () => {
    const base = Slug.fromTitle('How to train your dragon')

    expect(base.withSuffix(2).value).toBe('how-to-train-your-dragon-2')
    expect(base.withSuffix(3).value).toBe('how-to-train-your-dragon-3')
  })

  it('AC-3: suffixe toujours depuis le slug de base, jamais en cascade', () => {
    // Un adapter qui réutiliserait le candidat refusé au lieu du slug initial
    // produirait « …-2-3 ». Le slug de base reste intact parce que le value
    // object est immuable — cette assertion le prouve plutôt que de l'espérer.
    const base = Slug.fromTitle('How to train your dragon')
    base.withSuffix(2)

    expect(base.value).toBe('how-to-train-your-dragon')
  })
})

describe('REQ-ARTICLE-004 — reconstitution du slug depuis la persistance', () => {
  it('AC-1: restitue la valeur stockée sans la re-slugifier', () => {
    // Re-slugifier à la lecture ferait diverger la valeur en mémoire de celle
    // en base au premier changement de règle de slugification, et l'article
    // deviendrait introuvable par le slug qui le désigne pourtant.
    const persisted = 'how-to-train-your-dragon-2'

    expect(Slug.fromPersisted(persisted).value).toBe(persisted)
  })
})
