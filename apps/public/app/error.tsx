"use client";

import { useEffect } from "react";
import { IconTile } from "./components/ui/icon-tile";
import { bodyFont, headingFont } from "./fonts";
import "./globals.css";
import "./styles/pages/institutional.css";

/**
 * Root error boundary. It sits above the `[locale]` segment, which owns `<html>` and `<body>`, so it
 * renders its own document and stays in French, the default locale.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <main className="am-main" id="contenu">
          <section className="am-section">
            <div className="am-container">
              <div className="am-errorpage">
                <span className="am-errorpage__icon">
                  <IconTile name="alert-triangle" size="lg" tone="warning" />
                </span>
                <h1 className="am-errorpage__title">Une erreur est survenue</h1>
                <p className="am-errorpage__lead">
                  Le service public est momentanement indisponible. Reessayez dans quelques instants.
                </p>
                <p className="am-errorpage__actions">
                  <button className="am-button" data-variant="primary" type="button" onClick={reset}>
                    <span>Reessayer</span>
                  </button>
                </p>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
