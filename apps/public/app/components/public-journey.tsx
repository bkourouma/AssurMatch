export function TechnicalRoleNotice() {
  return (
    <p className="pub-notice">
      AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers
      partenaires autorises.
    </p>
  );
}

export function IndicativeOfferNotice() {
  return <p className="pub-notice pub-notice--indicative">Offre indicative, prix a confirmer par le courtier partenaire.</p>;
}

/**
 * Visitor journey shortcuts. The country and product default to the first publicly activated pair,
 * but every caller that knows its own scope passes it so the links never dead-end elsewhere.
 */
export function PublicJourneyActions({ countryCode = "CI", productKey = "auto" }: { countryCode?: string; productKey?: string }) {
  const productPath = `/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}`;
  return (
    <nav className="pub-card pub-card--plain" aria-label="Parcours public">
      <h2 className="pub-card__title">Poursuivre votre parcours</h2>
      <div className="pub-actions">
        <a className="pub-button" href={`${productPath}/offers`}>Comparer les offres</a>
        <a className="pub-button pub-button--primary" href={`${productPath}/quote`}>Demander un devis</a>
        <a className="pub-button" href={`${productPath}/quote`}>Etre rappele par un courtier partenaire</a>
      </div>
      <p className="pub-fineprint">
        Votre demande n'est transmise qu'apres votre consentement explicite, a un courtier partenaire
        autorise pour ce pays et ce produit.
      </p>
    </nav>
  );
}
