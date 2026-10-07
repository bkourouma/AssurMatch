import Link from "next/link";
import { Directory, type DirectoryItem } from "./components/ui/directory";
import { Hero } from "./components/ui/hero";
import { Logo } from "./components/ui/logo";
import { signFont } from "./fonts";
import "./globals.css";
import "./styles/pages/institutional.css";

/**
 * Root 404. It is rendered outside the `[locale]` segment, where no locale and no chrome exist yet,
 * so it carries its own document and falls back to French, the default locale. The rows use plain
 * anchors to the French URLs (`externalHref`), because a typed localised route needs a locale
 * context this document does not have. The logo stands in for the missing header and leads home.
 */
export const metadata = { title: "Page introuvable | AssurMatch" };

const DESTINATIONS: DirectoryItem[] = [
  { key: "compare", title: "Comparer les offres", icon: "search", externalHref: "/pays" },
  { key: "home", title: "Retour à l'accueil", icon: "home", externalHref: "/" },
  { key: "how-it-works", title: "Comment ça marche", icon: "compass", externalHref: "/comment-ca-marche" },
  { key: "guides", title: "Guides", icon: "book-open", externalHref: "/guides" },
  { key: "faq", title: "FAQ", icon: "help-circle", externalHref: "/faq" },
  { key: "contact", title: "Contact", icon: "mail", externalHref: "/contact" }
];

export default function RootNotFound() {
  return (
    <html lang="fr" className={signFont.variable}>
      <body>
        <main className="am-main" id="contenu">
          <Hero
            className="am-errorsign am-errorsign--bare"
            title="Page introuvable"
            lead="Cette page n'existe pas ou n'est plus publiée. Vous pouvez repartir des pays ouverts ou comparer des offres indicatives."
            breadcrumb={
              <Link className="am-errorsign__home" href="/">
                <Logo variant="white" height={30} />
              </Link>
            }
          >
            <Directory items={DESTINATIONS} surface="plate" columns={2} />
          </Hero>
        </main>
      </body>
    </html>
  );
}
