import Link from "next/link";
import { IconTile } from "./components/ui/icon-tile";
import { bodyFont, headingFont } from "./fonts";
import "./globals.css";
import "./styles/pages/institutional.css";

/**
 * Root 404. It is rendered outside the `[locale]` segment, where no locale and no chrome exist yet,
 * so it carries its own document and falls back to French, the default locale. The links are plain
 * `next/link` anchors, not the `Button` primitive, because that one resolves localised routes through
 * a context this document does not have.
 */
export default function RootNotFound() {
  return (
    <html lang="fr" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <main className="am-main" id="contenu">
          <section className="am-section">
            <div className="am-container">
              <div className="am-errorpage">
                <span className="am-errorpage__icon">
                  <IconTile name="compass" size="lg" />
                </span>
                <h1 className="am-errorpage__title">Page introuvable</h1>
                <p className="am-errorpage__lead">
                  Cette page n&apos;existe pas ou n&apos;est plus publiee. Vous pouvez repartir des pays ouverts ou comparer
                  des offres indicatives.
                </p>
                <p className="am-errorpage__actions">
                  <Link className="am-button" data-variant="primary" href="/pays">
                    <span>Comparer les offres</span>
                  </Link>
                  <Link className="am-button" data-variant="secondary" href="/">
                    <span>Retour a l&apos;accueil</span>
                  </Link>
                </p>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
