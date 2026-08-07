import { DEFAULT_PAGE_LIMIT } from '@repo/shared'
import { describe, expect, it } from 'vitest'
import {
  offsetForPage,
  pageCount,
  pageFormTarget,
  pageFromParam,
  WEB_PAGE_LIMIT,
} from './pagination'

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

  it('AC-10: compte les pages sur la taille de page du front, pas sur celle de l’API', () => {
    // 15 articles font deux pages de dix, et une seule de vingt. Tant que le
    // front comptait sur `DEFAULT_PAGE_LIMIT`, aucune seconde page n'existait —
    // et toutes les assertions de pagination tombaient, y compris celles qui
    // portent en apparence sur l'URL ([ADR 023]).
    expect(WEB_PAGE_LIMIT).toBe(10)
    expect(WEB_PAGE_LIMIT).not.toBe(DEFAULT_PAGE_LIMIT)
    expect(pageCount(15)).toBe(2)
    expect(pageCount(10)).toBe(1)
  })

  it('AC-6: convertit un numéro de page en décalage, la première valant zéro', () => {
    expect(offsetForPage(1, 20)).toBe(0)
    expect(offsetForPage(2, 20)).toBe(20)
    expect(offsetForPage(3, 20)).toBe(40)
  })

  it('AC-10: décale sur la taille de page du front par défaut', () => {
    // Le décalage et le comptage doivent partir de la **même** taille : les
    // faire diverger ne lève rien et fait sauter des articles entre deux pages.
    expect(offsetForPage(2)).toBe(WEB_PAGE_LIMIT)
    expect(offsetForPage(3)).toBe(2 * WEB_PAGE_LIMIT)
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
    // contrôle.
    const target = pageFormTarget(
      '/',
      new URLSearchParams({ tag: 'dragons', feed: 'following' }),
      2
    )

    expect(target.action).toBe('/')
    expect(target.fields).toEqual([
      ['tag', 'dragons'],
      ['feed', 'following'],
    ])
    expect(target.page).toBe('2')
  })

  it('AC-12: soumet les filtres avant la page, jamais l’inverse', () => {
    // L'ordre du DOM est l'ordre de soumission : c'est lui qui produit
    // `/?feed=following&page=2`, la forme exacte que le contrat attend.
    const target = pageFormTarget('/', new URLSearchParams({ feed: 'following' }), 2)

    const submitted = new URLSearchParams()
    for (const [name, value] of target.fields) {
      submitted.append(name, value)
    }
    submitted.append('page', target.page ?? '')

    expect(submitted.toString()).toBe('feed=following&page=2')
  })

  it('AC-5: conserve le chemin courant, pas seulement la requête', () => {
    const target = pageFormTarget('/tag/dragons', new URLSearchParams(), 3)

    expect(target.action).toBe('/tag/dragons')
    expect(target.fields).toEqual([])
    expect(target.page).toBe('3')
  })

  it('AC-6: n’envoie aucun paramètre de page sur la première, pour une URL canonique', () => {
    // `/?page=1` et `/` désignent la même chose : en produire deux ferait deux
    // entrées d'historique et deux URL à indexer pour une seule page. Un
    // contrôle sans nom n'étant pas soumis, `page: null` est l'instruction de ne
    // pas nommer le bouton.
    expect(pageFormTarget('/', new URLSearchParams({ tag: 'dragons' }), 1).page).toBeNull()
    expect(pageFormTarget('/', new URLSearchParams(), 1)).toEqual({
      action: '/',
      fields: [],
      page: null,
    })
  })

  it('AC-5: ne reporte jamais la page courante en champ caché', () => {
    // Sinon le formulaire soumettrait deux `page` — l'ancienne et la nouvelle —
    // et le serveur retiendrait la première.
    const target = pageFormTarget('/', new URLSearchParams({ page: '4', feed: 'following' }), 2)

    expect(target.fields).toEqual([['feed', 'following']])
  })
})
