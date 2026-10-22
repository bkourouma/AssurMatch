"use client";

import { useEffect, useState } from "react";

/**
 * Last-resort error boundary. It replaces the root layout, so it renders its own `<html>`/`<body>`
 * and cannot rely on next-intl or any provider: the two languages live in a local dictionary.
 * Self-contained on purpose (no shared import) so the three apps stay separated.
 */
type Lang = "fr" | "en";

const COPY: Record<Lang, { title: string; body: string; retry: string; home: string; reference: string }> = {
  fr: {
    title: "Une erreur est survenue",
    body: "Le service est momentanément indisponible. Réessayez dans quelques instants.",
    retry: "Réessayer",
    home: "Retour à l'accueil",
    reference: "Référence"
  },
  en: {
    title: "Something went wrong",
    body: "The service is temporarily unavailable. Please try again in a few moments.",
    retry: "Try again",
    home: "Back to home",
    reference: "Reference"
  }
};

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
      <body style={{ margin: 0, background: "#ffffff", color: "#101828", fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 28, lineHeight: 1.2, color: "#12377f" }}>{copy.title}</h1>
          <p style={{ margin: "0 0 24px", fontSize: 18, lineHeight: 1.5 }}>{copy.body}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{ background: "#12377f", color: "#ffffff", border: "2px solid #12377f", borderRadius: 6, padding: "12px 20px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              {copy.retry}
            </button>
            <a href="/" style={{ color: "#12377f", fontSize: 16, fontWeight: 600, textDecoration: "underline", padding: "12px 4px" }}>
              {copy.home}
            </a>
          </div>
          {error.digest ? (
            <p style={{ margin: "32px 0 0", fontSize: 12, color: "#475467" }}>
              {copy.reference} : {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
