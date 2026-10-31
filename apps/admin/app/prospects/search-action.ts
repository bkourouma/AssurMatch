"use server";

import { redirect } from "next/navigation";
import type { AdminPage, AdminProspectListItem } from "../../../../packages/shared/contracts/admin-operations.contracts";
import { looksLikeProspectContact } from "../../../../packages/shared/security/prospect-contact-search";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "../lib/backoffice-auth";

/**
 * Spec 073 x lot 8 (spec 075): the prospects console searches.
 *
 * - `searchProspectsAction`: the filters (name fragment, country, product, anonymised) as a POST that
 *   redirects to `/prospects?...`. A name is not a contact value; an e-mail or phone typed in the
 *   name field is dropped (never put in the URL) and the page only shows `notice=contact`.
 * - `searchProspectsByContactAction`: an exact e-mail or phone, sent to
 *   `POST /admin/operations/prospects/contact-search` in the request body. Nothing is hashed here:
 *   the API matches the keyed blind index. The value never lands in a URL, a redirect, a notice or
 *   the returned state, which carries masked rows only.
 */

export type ProspectContactSearchState =
  | { status: "idle" }
  | { status: "success"; result: AdminPage<AdminProspectListItem> }
  | { status: "invalid" | "forbidden" | "unauthenticated" | "error"; message: string };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function searchProspectsAction(formData: FormData): Promise<void> {
  const params = new URLSearchParams();
  const search = text(formData, "search").slice(0, 200);
  if (search) {
    if (looksLikeProspectContact(search)) params.set("notice", "contact");
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

export async function searchProspectsByContactAction(_previous: ProspectContactSearchState, formData: FormData): Promise<ProspectContactSearchState> {
  const contact = text(formData, "contact").slice(0, 200);
  if (!contact || !looksLikeProspectContact(contact)) {
    return { status: "invalid", message: "Saisissez une adresse e-mail complète ou un numéro de téléphone (au moins 7 chiffres)." };
  }
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", message: "Session admin requise." };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/operations/prospects/contact-search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ contact, page: 1, pageSize: 50 }),
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", message: "Session expirée : reconnectez-vous." };
    if (response.status === 403) return { status: "forbidden", message: "Accès aux prospects refusé pour ce rôle admin. Le refus est journalisé." };
    if (response.status === 400) return { status: "invalid", message: "Recherche refusée par l'API : e-mail ou téléphone invalide." };
    if (!response.ok) return { status: "error", message: `Recherche indisponible (api_${response.status}).` };
    return { status: "success", result: await response.json() as AdminPage<AdminProspectListItem> };
  } catch {
    // Never the error message: it could quote the request.
    return { status: "error", message: "Recherche indisponible pour le moment." };
  }
}
