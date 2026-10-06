import { proxyBrokerBillingPdf } from "../../../../lib/billing-pdf-proxy";

/** Spec 060: telechargement du PDF d'une facture du cabinet via la session courtier. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyBrokerBillingPdf("invoices", id);
}
