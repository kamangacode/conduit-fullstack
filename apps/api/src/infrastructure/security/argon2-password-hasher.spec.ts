import { describe, expect, it } from 'vitest'
import { Argon2PasswordHasher } from './argon2-password-hasher'

/**
 * Testé contre la **vraie** bibliothèque, jamais un mock : ce qu'on veut prouver
 * ici est précisément ce que l'adapter délègue. Un mock d'argon2 vérifierait que
 * le code appelle la fonction qu'on lui a dit d'appeler, ce qui ne dit rien de la
 * propriété qui compte.
 */
const hasher = new Argon2PasswordHasher()

describe('REQ-USER-002 — hachage du mot de passe', () => {
  it('AC-5: produit un condensat qui ne contient pas le mot de passe', async () => {
    const digest = await hasher.hash('correct horse battery staple')

    expect(digest).not.toContain('correct horse battery staple')
  })

  it('AC-5: produit un condensat argon2id portant ses propres paramètres', async () => {
    const digest = await hasher.hash('jakejake')

    // Les paramètres encodés dans la chaîne PHC sont ce qui rend un durcissement
    // futur incrémental : un condensat calculé aujourd'hui restera vérifiable.
    expect(digest.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true)
  })

  it('AC-5: sale chaque condensat — deux hachages du même secret diffèrent', async () => {
    const [first, second] = await Promise.all([hasher.hash('jakejake'), hasher.hash('jakejake')])

    // Sans sel aléatoire, une table de correspondance précalculée casserait tous
    // les comptes partageant un mot de passe courant d'un seul coup.
    expect(first).not.toBe(second)
  })
})

describe('REQ-USER-003 — vérification du mot de passe', () => {
  it('AC-1: accepte le mot de passe qui a produit le condensat', async () => {
    const digest = await hasher.hash('jakejake')

    expect(await hasher.verify(digest, 'jakejake')).toBe(true)
  })

  it('AC-2: refuse un mot de passe différent', async () => {
    const digest = await hasher.hash('jakejake')

    expect(await hasher.verify(digest, 'jakejakE')).toBe(false)
  })

  it('AC-2: refuse deux condensats issus du même secret comme mot de passe', async () => {
    // Garde-fou contre une inversion d'arguments : passer le condensat en guise
    // de mot de passe doit échouer, pas réussir par accident.
    const digest = await hasher.hash('jakejake')

    expect(await hasher.verify(digest, digest)).toBe(false)
  })

  it('AC-2: renvoie false sur un condensat illisible au lieu de lever', async () => {
    // Le cas survient dès qu'une ligne a été écrite par un autre algorithme ou
    // corrompue. Laisser remonter l'exception produirait un 500 là où la réponse
    // juste est « ces identifiants ne conviennent pas ».
    await expect(hasher.verify('pas-un-condensat', 'jakejake')).resolves.toBe(false)
  })

  it('AC-2: renvoie false sur un condensat vide', async () => {
    await expect(hasher.verify('', 'jakejake')).resolves.toBe(false)
  })

  it('AC-1: n’ampute pas les mots de passe longs', async () => {
    // bcrypt tronque silencieusement au-delà de 72 octets : deux mots de passe
    // longs partageant leur préfixe s'y équivaudraient. Argon2 n'a pas cette
    // limite, et ce test le prouve plutôt que de le supposer (ADR 007).
    const long = 'a'.repeat(100)
    const longer = `${'a'.repeat(100)}difference`

    const digest = await hasher.hash(long)

    expect(await hasher.verify(digest, long)).toBe(true)
    expect(await hasher.verify(digest, longer)).toBe(false)
  })
})
