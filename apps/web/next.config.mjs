/**
 * Config Next.js. `transpilePackages` déclare @repo/shared comme package du
 * monorepo à transpiler : le front consomme le modèle Conduit partagé sans
 * étape de génération — le compilateur TypeScript est le contrat (voir
 * architecture/architecture.md §6).
 *
 * @type {import('next').NextConfig}
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/shared"],
  // Ancre le tracing de fichiers à la racine du monorepo : sans cela, Next peut
  // inférer une mauvaise racine en présence d'un lockfile parasite hors repo.
  outputFileTracingRoot: path.join(currentDir, "../.."),
};

export default nextConfig;
