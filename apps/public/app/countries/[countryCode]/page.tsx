import { TechnicalRoleNotice } from "../../components/public-journey";
import { listPublicProducts } from "../../lib/public-api";

export default async function PublicCountryPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params;
  const products = await listPublicProducts(countryCode);
  const countryPath = encodeURIComponent(countryCode);

  return (
    <main className="pub-page">
      <section className="pub-section">
        <h1>AssurMatch {countryCode}</h1>
        <TechnicalRoleNotice />
        <p className="pub-lead">Les produits visibles dependent des activations publiques par pays et par produit.</p>
      </section>

      {products.status === "error" ? (
        <p role="alert">{products.publicMessage ?? "Catalogue public temporairement indisponible."}</p>
      ) : null}
      {products.status === "empty" ? (
        <p role="status">
          Aucun produit public actif pour ce pays pour le moment. Aucune demande de devis ne peut etre transmise tant
          qu'un produit n'est pas active publiquement.
        </p>
      ) : null}

      {products.status === "success" ? (
        <section className="pub-section" aria-label="Produits publics">
          <h2>Produits disponibles</h2>
          <ul className="pub-cards pub-cards--two">
            {products.data.map((product) => {
              const productPath = `/countries/${countryPath}/products/${encodeURIComponent(product.key)}`;
              return (
                <li className="pub-card" key={product.id}>
                  <h3 className="pub-card__title">
                    <a href={productPath}>{product.name}</a>
                  </h3>
                  <p className="pub-meta">
                    <span className="pub-badge" data-tone="info">{product.key}</span>{" "}
                    <span className="pub-badge" data-tone={product.comparisonEnabled ? "success" : "disabled"}>
                      {product.comparisonEnabled ? "Comparaison activee" : "Comparaison non activee"}
                    </span>{" "}
                    <span className="pub-badge" data-tone={product.quoteEnabled ? "success" : "disabled"}>
                      {product.quoteEnabled ? "Devis active" : "Devis non active"}
                    </span>
                  </p>
                  <div className="pub-actions">
                    <a className="pub-button" href={productPath}>Voir la fiche produit</a>
                    {product.comparisonEnabled ? (
                      <a className="pub-button" href={`${productPath}/offers`}>Comparer les offres</a>
                    ) : null}
                    {product.quoteEnabled ? (
                      <a className="pub-button pub-button--primary" href={`${productPath}/quote`}>Demander un devis</a>
                    ) : null}
                  </div>
                  {!product.comparisonEnabled ? (
                    <p className="pub-fineprint">
                      La comparaison publique n'est pas activee pour ce produit dans ce pays.
                    </p>
                  ) : null}
                  {!product.quoteEnabled ? (
                    <p className="pub-fineprint">
                      La demande de devis n'est pas disponible pour ce produit dans ce pays.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="pub-fineprint">
            Offre indicative, prix indicatif a confirmer par le courtier partenaire. Aucune offre expiree ou non
            validee n'est affichee comme disponible.
          </p>
        </section>
      ) : null}
    </main>
  );
}
