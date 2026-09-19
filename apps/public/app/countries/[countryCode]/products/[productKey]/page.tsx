import { IndicativeOfferNotice, PublicJourneyActions, TechnicalRoleNotice } from "../../../../components/public-journey";
import { VisitorAiAssistant } from "../../../../components/visitor-ai-assistant";

export default async function PublicProductPage({ params }: { params: Promise<{ countryCode: string; productKey: string }> }) {
  const { countryCode, productKey } = await params;
  const productPath = `/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}`;

  return (
    <main className="pub-page">
      <section className="pub-section">
        <p className="pub-back">
          <a href={`/countries/${encodeURIComponent(countryCode)}`}>Retour aux produits {countryCode}</a>
        </p>
        <h1>Produit {productKey} - {countryCode}</h1>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
        <p className="pub-fineprint">Les offres expirees ou non validees ne sont pas affichees comme disponibles.</p>
        <nav className="pub-actions" aria-label="Comparateur">
          <a className="pub-button pub-button--primary" href={`${productPath}/offers`}>
            Comparer les offres de ce produit
          </a>
          <a className="pub-button" href={`${productPath}/quote`}>Demander un devis</a>
        </nav>
      </section>

      <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="product" />
      <VisitorAiAssistant countryCode={countryCode} mode="faq" />

      <PublicJourneyActions countryCode={countryCode} productKey={productKey} />
    </main>
  );
}
