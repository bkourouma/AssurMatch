import { proxyBrokerBillingPdf } from "../../../../lib/billing-pdf-proxy";

/** Spec 060: telechargement du PDF d'un avoir du cabinet via la session courtier. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyBrokerBillingPdf("credit-notes", id);
}
