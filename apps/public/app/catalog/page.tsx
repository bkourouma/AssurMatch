import { listPublicCountries } from "../lib/public-api";

export default async function PublicCatalogShellPage() {
  const countries = await listPublicCountries();

  return (
    <main>
      <h1>Catalogue indicatif</h1>
      <p>Les pays et produits visibles dependent des activations publiques. Les offres restent a confirmer par le courtier partenaire.</p>
      {countries.error ? <p role="status">Catalogue public temporairement indisponible.</p> : null}
      {countries.data.length === 0 ? <p>Aucun pays public actif pour le moment.</p> : <p>{countries.data.length} pays public actif.</p>}
    </main>
  );
}
