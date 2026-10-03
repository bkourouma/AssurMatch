"use server";

import type { AdminConsentRecordSearchResult } from "../../../../packages/shared/contracts/compliance.contracts";
import { backOfficeApiBaseUrl, getBackOfficeToken } from "./backoffice-auth";

/**
 * Spec 059 follow-up: consent-proof search (compliance_admin / super_admin). The criteria go to
 * `POST /admin/consent-records/search` in the request body: the visitor e-mail never lands in a
 * URL, a notice or the page state. The API fingerprints it, checks the role and MFA, and audits.
 */

export type ConsentRecordSearchState =
  | { status: "idle" }
  | { status: "success"; result: AdminConsentRecordSearchResult; byEmail: boolean }
  | { status: "invalid" | "forbidden" | "unauthenticated" | "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^QR-\d{4}-[A-Z0-9]{8}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURPOSES = new Set(["lead_transmission", "document_upload", "technical_notification", "ai_processing", "marketing_optional", "service_quality_survey"]);
const STATUSES = new Set(["granted", "withdrawn", "expired", "anonymized"]);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function searchConsentRecordsAction(_previous: ConsentRecordSearchState, formData: FormData): Promise<ConsentRecordSearchState> {
  const publicReference = text(formData, "publicReference").toUpperCase();
  const email = text(formData, "email").toLowerCase();
  const countryId = text(formData, "countryId");
  const purpose = text(formData, "purpose");
  const status = text(formData, "status");
  const page = Number.parseInt(text(formData, "page") || "1", 10);
  if (publicReference && !REFERENCE.test(publicReference)) return { status: "invalid", message: "Reference invalide : format attendu QR-AAAA-XXXXXXXX." };
  if (email && (!EMAIL.test(email) || email.length > 254)) return { status: "invalid", message: "Adresse e-mail invalide." };
  if (countryId && !UUID.test(countryId)) return { status: "invalid", message: "Pays invalide." };
  if (!publicReference && !email && !countryId) return { status: "invalid", message: "Indiquez au moins une reference de demande, une adresse e-mail ou un pays." };

  const body = {
    ...(publicReference ? { publicReference } : {}),
    ...(email ? { email } : {}),
    ...(countryId ? { countryId } : {}),
    ...(PURPOSES.has(purpose) ? { purpose } : {}),
    ...(STATUSES.has(status) ? { status } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: 50
  };
  const token = await getBackOfficeToken();
  if (!token) return { status: "unauthenticated", message: "Session admin requise." };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/consent-records/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    if (response.status === 401) return { status: "unauthenticated", message: "Session expiree : reconnectez-vous." };
    if (response.status === 403) return { status: "forbidden", message: "Recherche reservee a la conformite et au Super Admin, avec MFA verifiee. Le refus est journalise." };
    if (response.status === 400) return { status: "invalid", message: "Criteres refuses par l'API." };
    if (!response.ok) return { status: "error", message: `Recherche indisponible (api_${response.status}).` };
    return { status: "success", result: await response.json() as AdminConsentRecordSearchResult, byEmail: Boolean(email) };
  } catch {
    return { status: "error", message: "Recherche indisponible pour le moment." };
  }
}
