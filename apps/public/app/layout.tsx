import "./globals.css";

export const metadata = {
  title: "AssurMatch - comparaison indicative",
  description:
    "Plateforme technique de comparaison indicative d'offres d'assurance et de mise en relation avec des courtiers partenaires autorises."
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="pub-shell">
          <header className="pub-header">
            <div className="pub-container pub-header__inner">
              <a className="pub-brand" href="/">
                <span className="pub-brand__name">AssurMatch</span>
                <span className="pub-brand__tagline">plateforme technique de comparaison indicative</span>
              </a>
              <nav className="pub-nav" aria-label="Navigation principale">
                <a className="pub-nav__link" href="/">Accueil</a>
                <a className="pub-nav__link" href="/catalog">Catalogue</a>
                <a className="pub-nav__link" href="/compare">Comparer</a>
              </nav>
            </div>
          </header>

          <div className="pub-container pub-main">{children}</div>

          <footer className="pub-footer">
            <div className="pub-container pub-footer__inner">
              <p className="pub-footer__mention">
                AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des
                courtiers partenaires autorises. Les offres affichees sont indicatives: chaque prix indicatif reste a
                confirmer par le courtier partenaire responsable. AssurMatch ne vend pas d'assurance, n'emet
                ni contrat ni attestation et n'encaisse aucune prime.
              </p>
              <p className="pub-footer__meta">
                Les pays, produits et offres visibles dependent des activations publiques. Une offre sponsorisee est
                toujours signalee.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
