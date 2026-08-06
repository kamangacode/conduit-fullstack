/**
 * Identifiant public d'un article, dérivé de son titre (règle R-1).
 *
 * Value object au sens DDD (rule 12) : immuable, identité par valeur,
 * constructeur privé et factories nommées. Le slug est une **valeur** et non une
 * chaîne quelconque — le typer distingue, à la compilation, le paramètre qui
 * attend un identifiant d'article de celui qui attend un titre, deux `string`
 * qu'on intervertit sans que rien ne proteste.
 *
 * Ce que cette classe ne fait **pas** : garantir l'unicité. Elle n'a aucun accès
 * au dépôt et ne peut donc pas savoir si `how-to-train-your-dragon` est déjà
 * pris. C'est délibéré et documenté dans
 * `docs/adr/010-unicite-du-slug-article.md` : l'unicité est arbitrée par la
 * contrainte `@unique` de PostgreSQL, seul endroit où « ce slug est-il libre ? »
 * et « je le prends » sont atomiques. La classe fournit seulement de quoi
 * proposer un candidat suivant (`withSuffix`).
 */

/**
 * Slug de repli quand le titre ne contient **aucun** caractère slugifiable —
 * « ??? », « 日本語 », « --- ».
 *
 * Refuser ce titre serait plus pur, mais non conforme : la spec exige que la
 * création aboutisse, et le titre a déjà passé la validation `@repo/shared`
 * (non vide après trim). Un slug vide produirait `/api/articles/`, c'est-à-dire
 * une route qui n'existe pas. Le repli garde l'article adressable ; s'il est
 * déjà pris, la résolution d'unicité produira `article-2`, `article-3`, etc.
 */
const FALLBACK_SLUG = 'article'

/**
 * Marques diacritiques que `NFD` isole en décomposant « é » en « e » + accent.
 *
 * Écrit avec la propriété Unicode `\p{Diacritic}` plutôt qu'avec la plage de
 * caractères correspondante : ces caractères sont invisibles dans un éditeur —
 * ils se collent au signe précédent — donc illisibles et intouchables en revue.
 */
const COMBINING_MARKS = /\p{Diacritic}/gu

/**
 * Slugification : translittération ASCII, minuscules, tout ce qui n'est ni
 * lettre ni chiffre devient un séparateur, séparateurs réduits et bornes
 * nettoyées.
 *
 * `normalize('NFD')` décompose les caractères accentués en lettre + diacritique,
 * ce qui permet de retirer les seconds et de conserver les premières : « Élevé »
 * donne `eleve`. Sans cette décomposition, « é » ne serait ni une lettre `a-z`
 * ni un chiffre, donc remplacé par un séparateur — et « Élevé » deviendrait
 * `l-ev`.
 */
function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug.length > 0 ? slug : FALLBACK_SLUG
}

export class Slug {
  private constructor(private readonly slug: string) {}

  /**
   * Dérive un slug depuis un titre (R-1). Deux titres identiques produisent le
   * même candidat : c'est voulu, et c'est le point de départ de la résolution
   * d'unicité, pas un défaut à corriger ici.
   */
  static fromTitle(title: string): Slug {
    return new Slug(slugify(title))
  }

  /**
   * Reconstitution depuis la persistance.
   *
   * Tolérante par contrat (rule 12) : la valeur relue a déjà été produite par
   * `fromTitle` au moment de sa création. La re-slugifier ferait diverger la
   * valeur en mémoire de la valeur en base dès que la règle de slugification
   * évoluerait — et rendrait donc l'article introuvable par son propre slug.
   */
  static fromPersisted(value: string): Slug {
    return new Slug(value)
  }

  get value(): string {
    return this.slug
  }

  /**
   * Candidat suivant pour la résolution d'unicité : `mon-titre` → `mon-titre-2`.
   *
   * Le suffixe s'applique toujours au slug **de base** (`this`), jamais en
   * cascade : appeler `withSuffix(3)` sur un slug déjà suffixé produirait
   * `mon-titre-2-3`. L'adapter qui boucle doit donc repartir du slug initial à
   * chaque tentative — la signature le permet, en prenant le rang plutôt qu'en
   * incrémentant un état interne.
   */
  withSuffix(rank: number): Slug {
    return new Slug(`${this.slug}-${rank}`)
  }

  /** Identité par valeur : deux slugs égaux désignent le même article. */
  equals(other: Slug): boolean {
    return this.slug === other.slug
  }

  toString(): string {
    return this.slug
  }
}
