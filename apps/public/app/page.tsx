export default function PublicHomePage() {
  return (
    <main className="pub-page">
      <section className="pub-hero">
        <p className="pub-kicker">Comparaison indicative</p>
        <h1>AssurMatch</h1>
        <p className="pub-lead">
          Plateforme technique de comparaison indicative et de mise en relation avec des courtiers agrees.
        </p>
        <div className="pub-actions">
          <a className="pub-button pub-button--primary" href="/catalog">Comparer les offres</a>
          <a className="pub-button" href="/catalog">Voir le catalogue indicatif</a>
        </div>
      </section>

      <section className="pub-section" aria-label="Comment ca marche">
        <h2>Comment ca marche</h2>
        <ol className="pub-steps">
          <li className="pub-step">
            <span className="pub-step__index" aria-hidden="true">1</span>
            <h3>Comparer</h3>
            <p>
              Vous comparez des offres indicatives par pays et par produit, avec leurs garanties, leur prix indicatif et
              un score explique.
            </p>
          </li>
          <li className="pub-step">
            <span className="pub-step__index" aria-hidden="true">2</span>
            <h3>Demander un devis</h3>
            <p>
              Vous remplissez une demande de devis et vous donnez votre consentement explicite avant toute transmission.
            </p>
          </li>
          <li className="pub-step">
            <span className="pub-step__index" aria-hidden="true">3</span>
            <h3>Etre recontacte par un courtier partenaire</h3>
            <p>
              Un courtier partenaire autorise pour ce pays et ce produit reprend votre demande et confirme le devis et
              les conditions.
            </p>
          </li>
        </ol>
        <p className="pub-fineprint">
          Les prix affiches sont indicatifs et restent a confirmer par le courtier partenaire. AssurMatch ne vend pas
          d'assurance et ne remplace pas l'analyse d'un professionnel agree.
        </p>
      </section>
    </main>
  );
}
