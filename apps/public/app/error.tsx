"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Root error boundary. It sits above the `[locale]` segment, which owns `<html>` and `<body>`, so it
 * renders its own document and stays in French, the default locale.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <main className="am-container am-main" id="contenu">
          <h1>Une erreur est survenue</h1>
          <p>Le service public est momentanement indisponible. Reessayez dans quelques instants.</p>
          <p className="pub-actions">
            <button className="am-button" type="button" onClick={reset}>
              Reessayer
            </button>
          </p>
        </main>
      </body>
    </html>
  );
}
