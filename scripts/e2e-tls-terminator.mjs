#!/usr/bin/env node
/**
 * Terminateur TLS jetable de l'exécution e2e (ADR 019).
 *
 * ## Pourquoi ce processus existe
 *
 * Deux fichiers de la suite officielle vendorée — `error-handling.spec.ts` et
 * `user-fetch-errors.spec.ts` — **figent** l'hôte de l'API dans leurs mocks :
 *
 *     const API_BASE = 'https://api.realworld.show/api'
 *     await page.route(`${API_BASE}/user`, …)
 *
 * là où les helpers de la même suite lisent, eux, la variable `API_BASE`. Un
 * `page.route()` filtre sur l'**URL demandée** : tant que le front interroge
 * `http://localhost:3101/api`, ces interceptions ne matchent jamais, et les 24
 * tests concernés éprouvent l'API réelle au lieu des pannes qu'ils décrivent.
 *
 * L'ADR 018 interdit de retoucher la suite. La seule voie restante est donc
 * d'amener le **navigateur** à demander l'URL qu'elle intercepte — et de faire
 * en sorte que les requêtes non interceptées atterrissent quand même sur notre
 * API, jamais sur la démo publique. Chromium résout l'hôte vers ce processus
 * (`--host-resolver-rules`, posé dans `playwright.config.ts`) ; ce processus
 * termine le TLS et relaie en clair vers l'API locale.
 *
 * ## Ce qu'il n'est pas
 *
 * Ce n'est **pas** un assouplissement de la suite : aucune assertion, aucun
 * délai, aucun `retries` ne change. Le contrat éprouvé est exactement celui de
 * l'amont ; c'est le câblage réseau qui devient conforme à ce que la suite
 * suppose de son environnement.
 *
 * ## Sûreté
 *
 * Le certificat est auto-signé, généré à chaque run dans un répertoire
 * temporaire, et n'est jamais installé dans un magasin de confiance : seul le
 * navigateur de test l'accepte, via `ignoreHTTPSErrors`. Rien de ce montage ne
 * survit au run.
 */

import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:https'

const options = parseArgs(process.argv.slice(2))
const upstream = new URL(options.upstream)

const server = createServer(
  {
    cert: readFileSync(options.cert),
    key: readFileSync(options.key),
  },
  (clientRequest, clientResponse) => {
    // Le chemin et la méthode sont relayés tels quels : ce processus ne
    // comprend rien au contrat Conduit et ne doit rien y comprendre. Toute
    // logique ajoutée ici deviendrait une différence entre ce que la suite
    // éprouve et ce que l'API sert réellement.
    const upstreamRequest = request(
      {
        host: upstream.hostname,
        port: upstream.port,
        method: clientRequest.method,
        path: clientRequest.url,
        headers: {
          ...clientRequest.headers,
          // L'API reçoit son propre hôte : le laisser à `api.realworld.show`
          // ferait apparaître dans ses journaux une origine qui n'existe pas,
          // et piégerait toute vérification qui s'y fierait.
          host: upstream.host,
        },
      },
      (upstreamResponse) => {
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
        upstreamResponse.pipe(clientResponse)
      }
    )

    // Une API arrêtée doit produire une erreur **lisible** côté navigateur, pas
    // une socket qui pend : un test bloqué jusqu'au délai d'attente de
    // Playwright coûte beaucoup plus cher à diagnostiquer qu'un 502.
    upstreamRequest.on('error', (error) => {
      clientResponse.writeHead(502, { 'content-type': 'text/plain' })
      clientResponse.end(`terminateur TLS : API injoignable (${error.message})\n`)
    })

    clientRequest.pipe(upstreamRequest)
  }
)

server.listen(options.port, '127.0.0.1', () => {
  // Ligne attendue par `test-e2e.sh` : elle sert de signal de disponibilité,
  // plutôt qu'une attente à l'aveugle qui rendrait le démarrage dépendant de la
  // charge de la machine.
  console.log(`terminateur TLS prêt sur https://127.0.0.1:${options.port} → ${options.upstream}`)
})

/**
 * Arguments nommés, tous obligatoires.
 *
 * Aucune valeur par défaut : un port ou un amont deviné silencieusement
 * enverrait le trafic ailleurs que là où l'appelant croit, ce qui est
 * précisément le défaut que ce processus existe pour corriger.
 */
function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.replace(/^--/, '')
    const value = argv[index + 1]
    if (name && value) {
      parsed[name] = value
    }
  }

  for (const required of ['port', 'upstream', 'cert', 'key']) {
    if (!parsed[required]) {
      console.error(`terminateur TLS : argument --${required} manquant.`)
      process.exit(2)
    }
  }

  return parsed
}
