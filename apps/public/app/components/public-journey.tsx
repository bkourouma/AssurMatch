export function TechnicalRoleNotice() {
  return (
    <p>
      AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers
      partenaires autorises.
    </p>
  );
}

export function IndicativeOfferNotice() {
  return <p>Offre indicative, prix a confirmer par le courtier partenaire.</p>;
}

export function PublicJourneyActions() {
  return (
    <nav aria-label="Parcours public">
      <a href="/countries/CI">Comparer les offres</a>
      <a href="/countries/CI/products/auto/quote">Demander un devis</a>
      <a href="/countries/CI/products/auto/quote">Etre rappele par un courtier partenaire</a>
    </nav>
  );
}
