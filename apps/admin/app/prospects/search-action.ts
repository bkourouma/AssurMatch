"use server";

import { redirect } from "next/navigation";
import { fingerprintTypedProspectContact, looksLikeProspectContact } from "../../../../packages/shared/security/prospect-contact-fingerprint";

/**
 * Spec 073: prospects filter submitted as a POST (server action). A typed e-mail or phone is hashed
 * here and only the hash (`contact`) goes into the redirect URL and the API call: the clear value
 * never appears in an URL, a query string, a server log or the browser history. A name fragment is
 * not a contact value and stays in `search`.
 */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function searchProspectsAction(formData: FormData): Promise<void> {
  const params = new URLSearchParams();
  const search = text(formData, "search").slice(0, 200);
  if (search) {
    if (looksLikeProspectContact(search)) params.set("contact", fingerprintTypedProspectContact(search));
    else params.set("search", search);
  }
  const country = text(formData, "country").toUpperCase();
  if (country) params.set("country", country);
  const product = text(formData, "product");
  if (product) params.set("product", product);
  if (text(formData, "includeAnonymized") === "true") params.set("includeAnonymized", "true");
  const query = params.toString();
  redirect(query ? `/prospects?${query}` : "/prospects");
}
