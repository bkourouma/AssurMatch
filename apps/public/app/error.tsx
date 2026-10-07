"use client";

import { useEffect } from "react";
import { Directory, type DirectoryItem } from "./components/ui/directory";
import { Hero } from "./components/ui/hero";
import { Icon } from "./components/ui/icons";
import { signFont } from "./fonts";
import "./globals.css";
import "./styles/pages/institutional.css";

/**
 * Plain anchors to the French URLs: this boundary sits above the `[locale]` segment and has no
 * locale context for typed routes. A full page load is also the surest way out of an error state.
 */
const DESTINATIONS: DirectoryItem[] = [
  { key: "home", title: "Retour à l'accueil", icon: "home", externalHref: "/" },
  { key: "compare", title: "Comparer les offres", icon: "search", externalHref: "/pays" }
];

/**
 * Root error boundary. It sits above the `[locale]` segment, which owns `<html>` and `<body>`, so it
 * renders its own document and stays in French, the default locale.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr" className={signFont.variable}>
      <body>
        <main className="am-main" id="contenu">
          <Hero
            className="am-errorsign am-errorsign--bare"
            title="Une erreur est survenue"
            lead="Le service public est momentanément indisponible. Réessayez dans quelques instants."
            actions={
              <button className="am-button" data-variant="primary" type="button" onClick={reset}>
                <Icon name="refresh" size={20} />
                <span>Réessayer</span>
              </button>
            }
          >
            <Directory items={DESTINATIONS} surface="plate" columns={2} />
          </Hero>
        </main>
      </body>
    </html>
  );
}
