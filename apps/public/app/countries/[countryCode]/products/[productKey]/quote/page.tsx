import { QuoteFormShell } from "../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../components/public-journey";
import { getPublicQuoteForm } from "../../../../../lib/public-api";

export default async function PublicQuotePage({ params }: { params: { countryCode: string; productKey: string } }) {
  const quoteForm = await getPublicQuoteForm(params.countryCode, params.productKey);

  return (
    <main>
      <h1>Demander un devis</h1>
      <TechnicalRoleNotice />
      {quoteForm.status === "success" && quoteForm.data ? (
        <QuoteFormShell countryCode={params.countryCode} productKey={params.productKey} quoteForm={quoteForm.data} />
      ) : (
        <p role="alert">La demande de devis n'est pas disponible pour ce pays ou ce produit.</p>
      )}
    </main>
  );
}
