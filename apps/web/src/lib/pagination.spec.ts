import { DEFAULT_PAGE_LIMIT } from '@repo/shared'
import { describe, expect, it } from 'vitest'
import { offsetForPage, pageCount, pageFromParam, pageHref } from './pagination'

/** Tests écrits depuis les critères de REQ-WEB-010, avant l'implémentation. */

describe('REQ-WEB-010 — calcul de pagination', () => {
  it('AC-1: déduit le nombre de pages du total annoncé par l’API', () => {
    // Le total et le nombre d'articles reçus coïncident exactement tant que le
    // jeu tient sous une page — c'est-à-dire pendant tout le développement
    // local. C'est pourquoi ce test part d'un total qui ne peut pas être une
    // taille de page.
    expect(pageCount(47, 20)).toBe(3)
    expect(pageCount(100, 20)).toBe(5)
  })

  it('AC-2: donne sa page à un reste qui ne remplit pas une page entière', () => {
    // 41 articles sur des pages de 20 font **trois** pages, pas deux. Une
    // division entière en perd une, et les articles 41 à 41 deviennent
    // inatteignables — cas limite qu'un jeu de test rond ne rencontre jamais.
    expect(pageCount(41, 20)).toBe(3)
    expect(pageCount(21, 20)).toBe(2)
    expect(pageCount(1, 20)).toBe(1)
  })

  it('AC-3: ne compte aucune page au-delà d’un écran unique', () => {
    expect(pageCount(20, 20)).toBe(1)
    expect(pageCount(0, 20)).toBe(0)
  })

  it('AC-1: utilise la taille de page du modèle partagé par défaut', () => {
    // Une constante locale qui diverge de celle de l'API produit des pages qui
    // se chevauchent ou qui sautent des articles, sans erreur.
    expect(pageCount(DEFAULT_PAGE_LIMIT + 1)).toBe(2)
  })

  it('AC-6: convertit un numéro de page en décalage, la première valant zéro', () => {
    expect(offsetForPage(1, 20)).toBe(0)
    expect(offsetForPage(2, 20)).toBe(20)
    expect(offsetForPage(3, 20)).toBe(40)
  })

  it('AC-6: lit le numéro de page de l’URL, et retombe sur la première', () => {
    expect(pageFromParam('3')).toBe(3)
    expect(pageFromParam(undefined)).toBe(1)
    // Une URL forgée à la main ou un lien pourri ne doit pas produire un
    // décalage négatif, que l'API rejetterait par un 422 illisible pour le
    // lecteur.
    expect(pageFromParam('0')).toBe(1)
    expect(pageFromParam('-4')).toBe(1)
    expect(pageFromParam('abc')).toBe(1)
    expect(pageFromParam('2.7')).toBe(1)
  })

  it('AC-5: conserve les filtres courants en changeant de page', () => {
    // Le symptôme sans cela — « je clique sur la page 2 d'un tag et j'atterris
    // sur le flux global » — se lit comme un bug de filtre alors qu'il vient du
    // lien.
    const href = pageHref('/', new URLSearchParams({ tag: 'dragons', feed: 'following' }), 2)

    const params = new URL(href, 'http://x.test').searchParams
    expect(params.get('tag')).toBe('dragons')
    expect(params.get('feed')).toBe('following')
    expect(params.get('page')).toBe('2')
  })

  it('AC-5: conserve le chemin courant, pas seulement la requête', () => {
    expect(pageHref('/tag/dragons', new URLSearchParams(), 3)).toBe('/tag/dragons?page=3')
  })

  it('AC-6: omet le paramètre de page sur la première, pour une URL canonique', () => {
    // `/?page=1` et `/` désignent la même chose : en produire deux ferait deux
    // entrées d'historique et deux URL à indexer pour une seule page.
    expect(pageHref('/', new URLSearchParams({ tag: 'dragons' }), 1)).toBe('/?tag=dragons')
    expect(pageHref('/', new URLSearchParams(), 1)).toBe('/')
  })
})
