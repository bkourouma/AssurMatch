import { IndicativeOfferNotice, PublicJourneyActions, TechnicalRoleNotice } from "../../../../components/public-journey";

export default function PublicProductPage({ params }: { params: { countryCode: string; productKey: string } }) {
  return (
    <main>
      <h1>Produit {params.productKey} - {params.countryCode}</h1>
      <TechnicalRoleNotice />
      <IndicativeOfferNotice />
      <p>Les offres expirees ou non validees ne sont pas affichees comme disponibles.</p>
      <PublicJourneyActions />
    </main>
  );
}
