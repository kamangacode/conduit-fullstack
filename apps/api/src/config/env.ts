import { z } from 'zod'

/**
 * Configuration d'environnement de l'API, validée au démarrage (rule 19).
 *
 * Le principe : **fail-fast**. Une variable manquante ou malformée doit empêcher
 * le process de démarrer, avec un message qui dit lequel et pourquoi. L'absence
 * de validation ne produit pas une panne franche mais une dégradation
 * silencieuse — une `DATABASE_URL` vide donne une 500 à la troisième requête, un
 * `JWT_SECRET` absent donne des tokens signés avec `undefined`. Dans les deux
 * cas, le symptôme apparaît loin de la cause.
 *
 * Aucune valeur par défaut sur les secrets, délibérément. Un `JWT_SECRET` avec
 * un défaut de développement est un secret qui finit un jour en production sans
 * que rien ne l'ait signalé : c'est précisément ce que le fail-fast doit rendre
 * impossible. Ce qui a un défaut ici n'a aucune conséquence de sécurité.
 *
 * Ce module est **pur** : il ne lit pas `process.env` de lui-même et ne quitte
 * pas le process. `main.ts` décide de l'arrêt, les tests passent leur propre
 * source — un module qui se valide à l'import serait intestable.
 */

/** Longueur minimale du secret de signature JWT (256 bits en hexadécimal). */
const JWT_SECRET_MIN_LENGTH = 32

const DEFAULT_PORT = 3001

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce
    .number({ error: 'doit être un nombre' })
    .int('doit être un entier')
    .min(1, 'doit être un port valide (1-65535)')
    .max(65535, 'doit être un port valide (1-65535)')
    .default(DEFAULT_PORT),

  DATABASE_URL: z
    .string({ error: 'requise — voir apps/api/.env.example' })
    .min(1, 'requise — voir apps/api/.env.example')
    .refine(
      (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
      'doit être une URL PostgreSQL (postgresql://…)'
    ),

  JWT_SECRET: z
    .string({ error: 'requis — générer avec `openssl rand -hex 32`' })
    .min(
      JWT_SECRET_MIN_LENGTH,
      `doit faire au moins ${JWT_SECRET_MIN_LENGTH} caractères (générer avec \`openssl rand -hex 32\`)`
    ),

  /** Durée de validité des tokens, au format accepté par la lib JWT (`7d`, `24h`, `3600s`). */
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'doit être une durée du type 7d, 24h ou 3600s')
    .default('7d'),

  /**
   * Origine(s) autorisée(s) pour les requêtes cross-origin du navigateur (CORS).
   *
   * Le front (`apps/web`) tourne sur une origine distincte de l'API : sans cette
   * autorisation, le navigateur bloque chaque `fetch` avant même d'exploiter la
   * réponse, et le front n'a d'autre symptôme qu'un « unable to reach the
   * server » — le serveur répond pourtant (201), c'est le navigateur qui rejette
   * la réponse faute d'en-tête `Access-Control-Allow-Origin`. Défaut : l'origine
   * de dev. Ce défaut n'a aucune conséquence de sécurité : une origine trop
   * restrictive bloque, elle ne divulgue rien ; la production doit la poser.
   *
   * Format : une ou plusieurs origines séparées par des virgules
   * (`https://app.example.com,https://admin.example.com`).
   */
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    ),
})

export type Env = z.infer<typeof envSchema>

/**
 * Met en forme les problèmes de validation, **sans jamais réafficher la valeur
 * reçue**.
 *
 * Ce n'est pas un détail cosmétique : ces messages partent sur la sortie
 * standard au démarrage, donc dans les logs de la plateforme d'hébergement.
 * Réafficher la valeur d'un `JWT_SECRET` malformé le publierait dans un endroit
 * qui n'est pas prévu pour en contenir, et que bien plus de gens peuvent lire
 * que la variable elle-même. `env.spec.ts` vérifie cette propriété.
 */
function formatEnvIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`)
  return [
    "Configuration d'environnement invalide — démarrage interrompu.",
    ...lines,
    '',
    'Voir apps/api/.env.example pour la liste complète et commentée.',
  ].join('\n')
}

/**
 * Valide une source de variables d'environnement.
 *
 * Lève une `Error` dont le message énumère **tous** les problèmes, pas seulement
 * le premier : corriger une variable pour découvrir la suivante au redémarrage
 * suivant transforme une configuration en jeu de piste.
 */
export function parseEnv(source: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(formatEnvIssues(result.error))
  }
  return result.data
}
