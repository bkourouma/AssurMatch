import { QuoteFormShell } from "../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../components/public-journey";

export default function PublicQuotePage() {
  return (
    <main>
      <h1>Demander un devis</h1>
      <TechnicalRoleNotice />
      <QuoteFormShell />
    </main>
  );
}
