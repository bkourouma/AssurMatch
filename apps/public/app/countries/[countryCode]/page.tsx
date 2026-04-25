import { PublicJourneyActions, TechnicalRoleNotice } from "../../components/public-journey";

export default function PublicCountryPage({ params }: { params: { countryCode: string } }) {
  return (
    <main>
      <h1>AssurMatch {params.countryCode}</h1>
      <TechnicalRoleNotice />
      <p>Les produits visibles dependent des activations publiques par pays et par produit.</p>
      <PublicJourneyActions />
    </main>
  );
}
