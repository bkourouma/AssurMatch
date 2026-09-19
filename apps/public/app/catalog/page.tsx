import { listPublicCountries } from "../lib/public-api";

export default async function PublicCatalogShellPage() {
  const countries = await listPublicCountries();

  return (
    <main className="pub-page">
      <section className="pub-section">
        <h1>Catalogue indicatif</h1>
        <p className="pub-lead">
          Les pays et produits visibles dependent des activations publiques. Les offres restent a confirmer par le
          courtier partenaire.
        </p>
      </section>

      {countries.status === "error" ? (
        <p role="status">Catalogue public temporairement indisponible.</p>
      ) : null}
      {countries.status !== "error" && countries.data.length === 0 ? (
        <p role="status">Aucun pays public actif pour le moment.</p>
      ) : null}

      {countries.status !== "error" && countries.data.length > 0 ? (
        <section className="pub-section" aria-label="Pays publics">
          <p className="pub-meta">{countries.data.length} pays public actif.</p>
          <ul className="pub-cards pub-cards--two">
            {countries.data.map((country) => (
              <li className="pub-card" key={country.isoCode}>
                <h2 className="pub-card__title">
                  <a href={`/countries/${encodeURIComponent(country.isoCode)}`}>{country.name}</a>
                </h2>
                <p className="pub-meta">
                  <span className="pub-badge" data-tone="info">Code ISO {country.isoCode}</span>
                </p>
                <p>
                  <a className="pub-button" href={`/countries/${encodeURIComponent(country.isoCode)}`}>
                    Voir les produits de ce pays
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
