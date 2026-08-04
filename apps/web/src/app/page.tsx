import { SHARED_MODEL_VERSION } from "@repo/shared";

/**
 * Page d'accueil (Phase 0) — squelette. Le markup suit déjà les classes du
 * template RealWorld (.home-page, .banner, .container, .logo-font). Le feed
 * global/tag, la sidebar des tags et la pagination arrivent en issue 6.
 *
 * L'import de `SHARED_MODEL_VERSION` prouve que le front consomme le modèle
 * partagé sans redéfinir de type : c'est une dépendance de compilation.
 */
export default function HomePage() {
  return (
    <main className="home-page">
      <div className="banner">
        <div className="container">
          <h1 className="logo-font">conduit</h1>
          <p>A place to share your knowledge.</p>
        </div>
      </div>
      <div className="container page">
        <p>
          Squelette full-stack TypeScript — modèle partagé v{SHARED_MODEL_VERSION}.
        </p>
      </div>
    </main>
  );
}
