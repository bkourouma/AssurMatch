import { type Page } from "@playwright/test";

// Spec 067: the quote form has an optional Documents step between the contact and the consent steps
// when the product accepts documents (flag product_document_upload_enabled, closed by default).

/**
 * Clicks "Vérifier ma demande" (or its English label) on the contact step and, when the Documents
 * step comes first, passes it without staging any file (its own "Vérifier ma demande" button leads
 * to the consent step). With the flag closed, the consent step is reached directly.
 */
export async function reviewQuote(visitor: Page, label = "Vérifier ma demande"): Promise<void> {
  const button = visitor.getByRole("button", { name: label });
  const consent = visitor.locator("#am-quote-consent");
  await button.click();
  // Hidden steps are not exposed by role queries: a visible button here is the Documents step one.
  await button.or(consent).first().waitFor({ state: "visible" });
  if (!(await consent.isVisible())) await button.click();
}
