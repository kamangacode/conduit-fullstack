import type { ReactNode } from "react";

export const metadata = {
  title: "Conduit",
  description:
    "A place to share your knowledge — clone RealWorld en full-stack TypeScript.",
};

/**
 * Coquille applicative (Phase 0). Le shell RealWorld complet — navbar
 * (.navbar/.navbar-brand/.nav-link) et footer — arrive avec l'auth (issue 5)
 * et les pages articles (issue 6), conformément au markup de référence
 * RealWorld (voir .claude/rules/11-design-realworld.md).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
