import { IndicativeOfferNotice, PublicJourneyActions, TechnicalRoleNotice } from "../../../../components/public-journey";
import { VisitorAiAssistant } from "../../../../components/visitor-ai-assistant";

export default async function PublicProductPage({ params }: { params: Promise<{ countryCode: string; productKey: string }> }) {
  const { countryCode, productKey } = await params;
  return (
    <main>
      <h1>Produit {productKey} - {countryCode}</h1>
      <TechnicalRoleNotice />
      <IndicativeOfferNotice />
      <p>Les offres expirees ou non validees ne sont pas affichees comme disponibles.</p>
      <nav aria-label="Comparateur">
        <a href={`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}/offers`}>Comparer les offres de ce produit</a>
      </nav>
      <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="product" />
      <VisitorAiAssistant countryCode={countryCode} mode="faq" />
      <PublicJourneyActions />
    </main>
  );
}
