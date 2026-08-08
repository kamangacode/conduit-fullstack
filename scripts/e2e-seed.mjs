#!/usr/bin/env node
// Jeu de données minimal que la suite e2e officielle suppose (REQ-CONF-003).
//
// ## Pourquoi ce fichier existe
//
// `scripts/test-e2e.sh` vide la base avant chaque run, et il a raison de le
// faire : un résidu du run précédent fait échouer la suite amont sur des tags
// globaux ou des listes d'articles, c'est-à-dire sur un chemin qui ne parle pas
// de conformité.
//
// Mais un test de la suite lit le flux global **sans le mocker** —
// `user-fetch-errors.spec.ts`, *should handle 401 Unauthorized on /api/user* —
// et assert qu'un `.article-preview` y est visible. En amont, la suite vise une
// démo publique peuplée depuis toujours ; chez nous, la page affiche très
// correctement « No articles are here... yet. » et le test rougit sur un défaut
// qui n'en est pas un. Aucune ligne d'`apps/web/src` ne peut le rendre vert :
// ce qui manque n'est pas un comportement, c'est une donnée.
//
// Fournir cette donnée n'assouplit rien. Aucune assertion ne bouge, aucun
// fichier vendoré n'est touché (ADR 018) : seul l'environnement que les
// assertions supposent est rendu vrai — même geste que l'ADR 019 pour l'hôte
// d'API.
//
// ## Deux propriétés qui ne sont pas des détails
//
// **Par l'API, jamais par la base.** Un `INSERT` direct fabriquerait un état
// que l'API n'aurait jamais accepté (slug mal dérivé, mot de passe non haché,
// colonne oubliée à la prochaine migration), et le premier symptôme serait un
// échec e2e imputé au front. Passer par l'API éprouve au passage qu'elle répond,
// ce qui arrête le harnais au bon endroit.
//
// **Idempotent.** La base est vidée à chaque run, mais rien ne l'impose à un
// appelant : `pnpm conformance:e2e` se relance, et un job CI rejoué peut
// retrouver un service Postgres réutilisé. Le script constate donc l'état avant
// d'écrire, plutôt que de supposer une base vierge.
//
// Prouvé par `scripts/verify-e2e-seed.sh`, qui l'exécute deux fois d'affilée
// contre un stub d'API puis contre un stub qui refuse.
//
// Usage : node scripts/e2e-seed.mjs --api-base http://localhost:3101/api

/**
 * Comptes que la suite suppose, chacun avec **un** article.
 *
 * Deux entrées, deux raisons distinctes — et aucune n'est un choix de confort :
 *
 * 1. `e2e-seed-author` répond au besoin d'origine (REQ-CONF-003 AC-1) : un flux
 *    global jamais vide, pour le test qui le lit sans le mocker.
 * 2. `johndoe` est le compte que la suite **nomme en clair** dans
 *    `social.spec.ts` : « API mode: johndoe exists with articles on the demo
 *    backend ». En mode API — le mode par défaut, et le nôtre — trois de ses
 *    tests visent ce username plutôt que d'inscrire un second compte. Sans ce
 *    compte, `/profile/johndoe` rend « Profile not found » et aucune ligne
 *    d'`apps/web/src` ne peut y changer quoi que ce soit : ce qui manque n'est
 *    pas un comportement, c'est une donnée. Le rendre présent, c'est réparer le
 *    **montage**, exactement comme l'ADR 019 pour l'hôte d'API — jamais le test.
 *
 * Les mots de passe ne sont pas des secrets : ils ouvrent des comptes d'une base
 * jetable, recréée à chaque run. Ils restent écrits ici plutôt que dans des
 * variables d'environnement pour que le script soit reproductible sans montage.
 *
 * Les articles sont volontairement fades et il y en a **un par compte**. Le jeu
 * de données n'est pas une fixture applicative : plus il grossit, plus il
 * devient une dépendance cachée des autres fichiers de specs, et plus l'ordre
 * d'exécution d'une suite parallélisée finit par compter.
 */
const SEED_ACCOUNTS = [
  {
    user: {
      username: 'e2e-seed-author',
      email: 'e2e-seed-author@conduit.test',
      password: 'e2e-seed-password',
    },
    article: {
      title: 'Conformance baseline article',
      description: 'Seeded by the e2e harness so the global feed is never empty.',
      body: 'This article exists only so that a test reading the unmocked global feed finds one.',
      tagList: ['conformance'],
    },
  },
  {
    // Le username est **imposé** par la suite : il est écrit en dur dans
    // `social.spec.ts`. L'e-mail et le mot de passe sont les nôtres, la suite ne
    // s'y connecte jamais — elle ne fait que consulter ce profil et le suivre.
    user: {
      username: 'johndoe',
      email: 'johndoe@conduit.test',
      password: 'johndoe-password',
    },
    article: {
      title: 'How to build a Conduit clone',
      description: 'Seeded by the e2e harness: the suite expects johndoe to have articles.',
      body: 'This article exists so that the profile and personal feed of johndoe are not empty.',
      tagList: ['conformance'],
    },
  },
]

/** Lit `--api-base <url>`, sans dépendance : deux arguments ne valent pas un parseur. */
function readApiBase(argv) {
  const index = argv.indexOf('--api-base')
  const value = index === -1 ? undefined : argv[index + 1]
  if (!value) {
    throw new Error('argument --api-base <url> manquant (ex. http://localhost:3101/api)')
  }
  return value.replace(/\/$/, '')
}

/**
 * Un appel HTTP, et **toujours** le corps lu.
 *
 * Le corps est relu en texte puis parsé à la main parce qu'un échec de parsing
 * doit rester diagnosticable : `response.json()` sur une page d'erreur HTML
 * lève un message qui ne dit rien de ce que l'API a répondu. Ici, le texte brut
 * remonte dans l'erreur.
 */
async function call(baseUrl, { method, path, token, body }) {
  const headers = { 'content-type': 'application/json' }
  if (token) {
    // Préfixe `Token`, singularité de la spec RealWorld : `Bearer` obtiendrait
    // un 401 sans que rien ne désigne l'en-tête fautif.
    headers.authorization = `Token ${token}`
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = undefined
  }

  return { status: response.status, ok: response.ok, body: parsed, text }
}

/**
 * Ouvre la session du compte de seed, en le créant s'il n'existe pas encore.
 *
 * L'ordre est « inscrire puis, si le compte est déjà pris, se connecter » et non
 * l'inverse : sur une base fraîche — le cas nominal — un seul aller-retour
 * suffit. Le 422 attendu au second passage est un état **normal**, pas une
 * erreur : c'est précisément ce qui rend le script idempotent.
 */
async function resolveToken(baseUrl, seedUser) {
  const registered = await call(baseUrl, {
    method: 'POST',
    path: '/users',
    body: { user: seedUser },
  })

  if (registered.ok) {
    return registered.body?.user?.token
  }

  // 422 (contrat RealWorld) ou 409 : le compte existe déjà, on se connecte.
  // Tout autre statut est un vrai échec et doit remonter — un 500 traité comme
  // « déjà inscrit » produirait une erreur de connexion incompréhensible juste
  // après.
  if (registered.status !== 422 && registered.status !== 409) {
    throw new Error(
      `inscription du compte de seed « ${seedUser.username} » refusée (HTTP ${registered.status}) : ${registered.text}`
    )
  }

  const loggedIn = await call(baseUrl, {
    method: 'POST',
    path: '/users/login',
    body: { user: { email: seedUser.email, password: seedUser.password } },
  })

  if (!loggedIn.ok) {
    throw new Error(
      `connexion du compte de seed « ${seedUser.username} » refusée (HTTP ${loggedIn.status}) : ${loggedIn.text}`
    )
  }

  return loggedIn.body?.user?.token
}

/**
 * L'article de seed existe-t-il déjà ?
 *
 * Le contrôle porte sur les articles **de ce compte** et non sur « la base
 * contient au moins un article » : la seconde formulation serait satisfaite par
 * un article qu'un fichier de specs vient de créer, et le jeu de données
 * deviendrait absent au run suivant sur une base vidée entre-temps. Filtrer par
 * auteur garde la décision indépendante de tout le reste (REQ-CONF-003 AC-4).
 */
async function seedArticleExists(baseUrl, username) {
  const listed = await call(baseUrl, {
    method: 'GET',
    path: `/articles?author=${encodeURIComponent(username)}&limit=1`,
  })

  if (!listed.ok) {
    throw new Error(
      `lecture des articles du compte de seed « ${username} » échouée (HTTP ${listed.status})`
    )
  }

  return (listed.body?.articles?.length ?? 0) > 0
}

/** Un compte, son article, et rien d'autre — la même séquence pour chaque entrée. */
async function seedAccount(baseUrl, { user, article }) {
  const token = await resolveToken(baseUrl, user)
  if (!token) {
    throw new Error(`l'API n'a pas rendu de jeton pour le compte de seed « ${user.username} »`)
  }

  if (await seedArticleExists(baseUrl, user.username)) {
    console.log(`ok: jeu de données de « ${user.username} » déjà présent — rien à créer.`)
    return
  }

  // `/articles` sans barre finale : la forme de l'ADR 021 est celle qu'un
  // **navigateur** doit émettre pour être interceptée par la suite. Ce script
  // tourne dans Node, hors de toute interception, et parle à l'API directement.
  const created = await call(baseUrl, {
    method: 'POST',
    path: '/articles',
    token,
    body: { article },
  })

  if (!created.ok) {
    throw new Error(
      `création de l'article de « ${user.username} » refusée (HTTP ${created.status}) : ${created.text}`
    )
  }

  console.log(
    `ok: article de « ${user.username} » créé (${created.body?.article?.slug ?? 'slug inconnu'}).`
  )
}

/**
 * Les comptes sont traités **en série**, pas en parallèle.
 *
 * Un `Promise.all` irait plus vite de quelques dizaines de millisecondes et
 * rendrait le premier échec ambigu : deux rejets simultanés, un seul remonté,
 * et le message ne dirait pas lequel des deux comptes a bloqué. Le harnais est
 * un outil de diagnostic avant d'être un outil rapide.
 */
async function seed(baseUrl) {
  for (const account of SEED_ACCOUNTS) {
    await seedAccount(baseUrl, account)
  }
}

// Sortie en code non nul, avec le vrai motif (AC-3). Sans ce contrat, l'absence
// de données se manifesterait plus tard sous la forme d'un échec e2e
// parfaitement crédible — « le front n'affiche pas les articles » — qui coûte
// une demi-heure de diagnostic sur le mauvais fichier.
try {
  await seed(readApiBase(process.argv.slice(2)))
} catch (error) {
  console.error(`ERREUR: jeu de données e2e non créé — ${error.message}`)
  process.exit(1)
}
