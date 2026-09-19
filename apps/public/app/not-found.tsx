import Link from "next/link";
import "./globals.css";

/**
 * Root 404. It is rendered outside the `[locale]` segment, where no locale and no chrome exist yet,
 * so it carries its own document and falls back to French, the default locale.
 */
export default function RootNotFound() {
  return (
    <html lang="fr">
      <body>
        <main className="am-container am-main" id="contenu">
          <h1>Page introuvable</h1>
          <p>
            Cette page n&apos;existe pas ou n&apos;est plus publiee. Vous pouvez repartir des pays ouverts ou comparer
            des offres indicatives.
          </p>
          <p className="pub-actions">
            <Link className="am-button" href="/pays">
              Comparer les offres
            </Link>
            <Link className="am-button" data-variant="secondary" href="/">
              Retour a l&apos;accueil
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
