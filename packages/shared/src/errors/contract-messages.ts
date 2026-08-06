/**
 * Les messages d'erreur que le contrat RealWorld met sur le fil.
 *
 * Ces chaînes ne sont pas de la prose : ce sont des **valeurs de protocole**, au
 * même titre qu'un code de statut. Un client de l'écosystème les affiche telles
 * quelles sous ses champs de formulaire, et la suite de conformité les compare
 * caractère pour caractère.
 *
 * Elles vivent ici — et non dans les classes d'erreur de `apps/api` ou dans les
 * messages Zod — pour une raison qu'une exécution de la suite officielle a
 * rendue concrète : tant qu'elles étaient dispersées, le contrat d'erreur de
 * l'API était en réalité celui de sa bibliothèque de validation. Un client
 * recevait `Too small: expected string to have >=1 characters` là où le contrat
 * dit `can't be blank`, et changer de bibliothèque de validation aurait changé
 * le contrat externe. Voir `docs/adr/017-messages-du-contrat-dans-shared.md`.
 *
 * **Chaque message asserté porte en commentaire le fichier de la suite qui
 * l'exige.** C'est cette référence qui fait la valeur de la table : elle
 * transforme « on pense que le message est celui-ci » en « voici l'assertion qui
 * le dit ». Un message sans référence est un message que nous avons choisi, et
 * le commentaire le dit aussi.
 *
 * Suite de référence : `apps/api/conformance/hurl/` (ADR 016).
 */
export const CONTRACT_MESSAGES = {
  /**
   * Champ obligatoire absent ou vide.
   *
   * Asserté pour `username`, `email` et `password` (`errors_auth.hurl`), pour
   * `title`, `description` et `body` d'un article (`errors_articles.hurl`), et
   * pour le corps d'un commentaire (`errors_comments.hurl`).
   *
   * Conséquence directe sur l'ordre des contrôles : un email à la chaîne vide
   * doit produire **ce** message, pas un motif de format. Un champ vide est vide
   * avant d'être malformé (REQ-ERROR-002 AC-2).
   */
  blank: "can't be blank",

  /**
   * Unicité violée sur l'email ou le username (règle R-8).
   *
   * Asserté par `errors_auth.hurl`, avec un statut 409 (ADR 009).
   */
  alreadyTaken: 'has already been taken',

  /**
   * Aucun en-tête `Authorization` exploitable — absent, ou d'un schéma autre que
   * `Token`.
   *
   * Asserté par `errors_articles.hurl`, `errors_auth.hurl`,
   * `errors_comments.hurl` et `errors_profiles.hurl`, sous la clé `token`.
   */
  tokenMissing: 'is missing',

  /**
   * Jeton **présent** mais refusé : signature invalide, expiré, ou sujet qui ne
   * résout plus vers un compte.
   *
   * Un seul message pour ces trois causes, et c'est la propriété : rien ne
   * renseigne le porteur sur l'état de son jeton. La distinction avec
   * `tokenMissing`, elle, ne lui apprend rien — il sait s'il a envoyé un jeton
   * (REQ-ERROR-002 AC-4).
   *
   * Non asserté par la suite, qui ne teste que l'absence : c'est donc **notre**
   * message, contraint seulement par le fait qu'il ne doit pas varier selon la
   * cause.
   */
  tokenInvalid: 'is invalid',

  /**
   * Connexion refusée, que l'email soit inconnu ou le mot de passe erroné.
   *
   * Asserté par `errors_auth.hurl` sous la clé `credentials`. L'indistinction
   * entre les deux causes est délibérée (REQ-USER-003 AC-3) : les distinguer
   * ferait de l'API un oracle répondant à « ce compte existe-t-il ? » sans
   * authentification.
   */
  credentialsInvalid: 'invalid',

  /**
   * Ressource absente : article, commentaire ou profil.
   *
   * Asserté par `errors_articles.hurl`, `errors_comments.hurl` et
   * `errors_profiles.hurl`, sous la clé de la ressource concernée.
   */
  notFound: 'not found',

  /**
   * Ressource existante, mais qui n'appartient pas à l'appelant (règle R-6).
   *
   * Asserté par `errors_authorization.hurl` pour l'article **et** pour le
   * commentaire — le même message pour les deux, sous des clés différentes. Le
   * statut est 403 et non 404 : les articles et commentaires de Conduit sont
   * publiquement lisibles, donc leur existence n'est pas une information
   * protégée (ADR 008).
   */
  forbidden: 'forbidden',

  /**
   * Email non vide mais malformé.
   *
   * **Non asserté** par la suite : c'est notre message. Il figure ici pour que
   * la contre-épreuve d'AC-2 puisse le nommer — sans quoi un schéma qui
   * répondrait « can't be blank » à tout email refusé passerait le test du
   * champ vide sans que rien ne le signale.
   */
  emailInvalid: 'is invalid',

  /**
   * Mot de passe non vide mais trop court.
   *
   * **Non asserté** : la suite exige seulement un 422 en dessous de 8
   * caractères et un 200 à partir de 8 (`errors_auth.hurl`, politique NIST
   * 800-63B). Le libellé est le nôtre.
   */
  passwordTooShort: 'is too short (minimum is 8 characters)',
} as const

/** Un message du contrat, pour les signatures qui en prennent un en paramètre. */
export type ContractMessage = (typeof CONTRACT_MESSAGES)[keyof typeof CONTRACT_MESSAGES]
