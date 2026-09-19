import { QuoteFormShell } from "../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../components/public-journey";
import { getPublicQuoteForm } from "../../../../../lib/public-api";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PublicQuotePage({ params, searchParams }: { params: Promise<{ countryCode: string; productKey: string }>; searchParams?: Promise<SearchParams> }) {
  const { countryCode, productKey } = await params;
  const query = searchParams ? await searchParams : {};
  const offerIdParam = Array.isArray(query.offerId) ? query.offerId[0] : query.offerId;
  const selectedOfferId = offerIdParam && /^[0-9a-f-]{36}$/i.test(offerIdParam) ? offerIdParam : undefined;
  const quoteForm = await getPublicQuoteForm(countryCode, productKey);

  return (
    <main>
      <h1>Demander un devis</h1>
      <TechnicalRoleNotice />
      {quoteForm.status === "success" && quoteForm.data ? (
        <QuoteFormShell countryCode={countryCode} productKey={productKey} quoteForm={quoteForm.data} selectedOfferId={selectedOfferId} />
      ) : (
        <p role="alert">La demande de devis n'est pas disponible pour ce pays ou ce produit.</p>
      )}
    </main>
  );
}
