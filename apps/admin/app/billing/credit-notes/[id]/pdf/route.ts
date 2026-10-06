import { proxyBillingPdf } from "../../../../lib/billing-pdf-proxy";

/** Spec 060: downloads a credit note PDF through the admin session. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyBillingPdf("credit-notes", id);
}
