"use client";

import { useEffect, useState } from "react";

/**
 * Last-resort error boundary. It replaces the root layout, so it renders its own `<html>`/`<body>`
 * and cannot rely on next-intl or any provider: the two languages live in a local dictionary.
 * Self-contained on purpose (no shared import) so the three apps stay separated.
 */
type Lang = "fr" | "en";

const COPY: Record<Lang, { scope: string; title: string; body: string; retry: string; home: string; reference: string; referenceHint: string }> = {
  fr: {
    scope: "Back-office Courtier",
    title: "Une erreur est survenue",
    body: "Votre espace courtier est momentanément indisponible. Réessayez dans quelques instants.",
    retry: "Réessayer",
    home: "Retour à l'accueil",
    reference: "Référence",
    referenceHint: "Indiquez cette référence au support AssurMatch si le problème persiste."
  },
  en: {
    scope: "Broker back-office",
    title: "Something went wrong",
    body: "Your broker workspace is temporarily unavailable. Please try again in a few moments.",
    retry: "Try again",
    home: "Back to home",
    reference: "Reference",
    referenceHint: "Give this reference to AssurMatch support if the problem persists."
  }
};

// Same dark ground and bone ink as the back-office design system; this boundary replaces the root layout,
// so the stylesheet is not loaded and the few rules it needs live here (focus ring, hover, phone width).
const BOUNDARY_CSS = `
.bo-boundary-action:focus-visible { outline: 2px solid #b79cf2; outline-offset: 2px; }
.bo-boundary-action[data-primary="true"]:hover { background: #ffffff; }
.bo-boundary-action[data-primary="false"]:hover { background: #272a2e; }
@media (max-width: 480px) { .bo-boundary-action { width: 100%; justify-content: center; } }
`;

function detectLang(): Lang {
  const candidates = [document.documentElement.lang, navigator.language];
  for (const candidate of candidates) {
    const code = (candidate ?? "").toLowerCase();
    if (code.startsWith("en")) return "en";
    if (code.startsWith("fr")) return "fr";
  }
  return "fr";
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Starts in French on server and client alike, then switches after hydration: no mismatch.
  const [lang, setLang] = useState<Lang>("fr");
  useEffect(() => {
    setLang(detectLang());
  }, []);
  const copy = COPY[lang];

  return (
    <html lang={lang} suppressHydrationWarning>
      <body style={{ margin: 0, minHeight: "100vh", background: "#141517", color: "#e8e5da", fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" }}>
        <style>{BOUNDARY_CSS}</style>
        <main role="alert" style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
          <p style={{ margin: "0 0 24px", fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <span style={{ display: "inline-block", paddingBottom: 3, borderBottom: "2px solid #b79cf2" }}>{copy.scope}</span>
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 400, lineHeight: 1.2 }}>{copy.title}</h1>
          <p style={{ margin: "0 0 24px", fontSize: 16, lineHeight: 1.5, color: "#c4c1b6" }}>{copy.body}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={reset}
              className="bo-boundary-action"
              data-primary="true"
              style={{ display: "inline-flex", alignItems: "center", minHeight: 44, background: "#e8e5da", color: "#141517", border: "1px solid #e8e5da", borderRadius: 2, padding: "0 16px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              {copy.retry}
            </button>
            <a
              href="/"
              className="bo-boundary-action"
              data-primary="false"
              style={{ display: "inline-flex", alignItems: "center", minHeight: 44, boxSizing: "border-box", color: "#e8e5da", border: "1px solid #4d5157", borderRadius: 2, padding: "0 16px", fontSize: 16, fontWeight: 600, textDecoration: "none" }}
            >
              {copy.home}
            </a>
          </div>
          {error.digest ? (
            <div style={{ margin: "32px 0 0", fontSize: 14, color: "#a6a395" }}>
              <p style={{ margin: 0 }}>
                {copy.reference} : <code style={{ fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace", color: "#e8e5da" }}>{error.digest}</code>
              </p>
              <p style={{ margin: "4px 0 0" }}>{copy.referenceHint}</p>
            </div>
          ) : null}
        </main>
      </body>
    </html>
  );
}
