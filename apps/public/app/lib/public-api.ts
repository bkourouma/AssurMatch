import type { OfferCompareResponse, OfferDetail, OfferSummary, QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { QuoteDocumentsResponse } from "../../../../packages/shared/contracts/quote-document.contracts";

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export interface PublicApiState<T> {
  status: "success" | "empty" | "error";
  data: T;
  error?: string;
  publicMessage?: string;
}

export interface PublicQuoteFormField {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "select" | "checkbox" | "date";
  required: boolean;
  sensitivity: "public" | "personal" | "sensitive";
  options?: string[];
}

export interface PublicQuoteFormState {
  formDefinitionId: string;
  version: string;
  /** Spec 043: the published definition's fields, which the form renders and submits as answers. */
  fields: PublicQuoteFormField[];
  consent: {
    consentTextId: string;
    version: string;
    contentHash: string;
  };
}

export interface PublicQuoteSubmitState {
  status: "success" | "error" | "rate_limited";
  publicReference?: string;
  /** Visitor-only token to read the request status and attach optional documents. */
  verificationToken?: string;
  error?: string;
  publicMessage: string;
}

export interface VisitorAiInteraction {
  id: string;
  assistType: string;
  status: "queued" | "completed" | "refused" | "failed";
  outputText: string | null;
  outputData: unknown;
  refusalReason: string | null;
  disclaimer: string;
  assistanceLabel: string;
  fallback: boolean;
}

export type VisitorAiAvailability = Array<{ assistType: string; enabled: boolean }>;

export async function readVisitorAiAvailability(countryCode: string, productKey?: string): Promise<VisitorAiAvailability> {
  try {
    const params = new URLSearchParams({ countryCode });
    if (productKey) params.set("productKey", productKey);
    const response = await fetch(`${PUBLIC_API_BASE_URL}/ai/visitor/availability?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return [];
    return await response.json() as VisitorAiAvailability;
  } catch {
    return [];
  }
}

export async function requestVisitorAi(assistType: string, body: Record<string, unknown>): Promise<{ status: "queued" | "error" | "rate_limited" | "disabled"; interaction?: VisitorAiInteraction; publicMessage?: string }> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}/ai/visitor/${encodeURIComponent(assistType)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 429) return { status: "rate_limited", publicMessage: "Trop de demandes d'assistance. Reessayez plus tard." };
    if (response.status === 422) return { status: "disabled", publicMessage: "L'assistant IA n'est pas disponible pour ce pays ou ce produit." };
    if (!response.ok) return { status: "error", publicMessage: "L'assistant IA est temporairement indisponible." };
    return { status: "queued", interaction: await response.json() as VisitorAiInteraction };
  } catch {
    return { status: "error", publicMessage: "L'assistant IA est temporairement indisponible." };
  }
}

export async function readVisitorAi(interactionId: string): Promise<VisitorAiInteraction | null> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}/ai/visitor/interactions/${encodeURIComponent(interactionId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as VisitorAiInteraction;
  } catch {
    return null;
  }
}

export interface PublicQuoteDocumentUploadState {
  status: "success" | "error" | "rate_limited" | "disabled";
  publicMessage: string;
}

export function listQuoteDocuments(publicReference: string, token: string) {
  const params = new URLSearchParams({ token });
  return readPublic<QuoteDocumentsResponse | null>(`/quote-requests/${encodeURIComponent(publicReference)}/documents?${params.toString()}`, null);
}

export async function uploadQuoteDocument(publicReference: string, token: string, formData: FormData): Promise<PublicQuoteDocumentUploadState> {
  try {
    const params = new URLSearchParams({ token });
    const response = await fetch(`${PUBLIC_API_BASE_URL}/quote-requests/${encodeURIComponent(publicReference)}/documents?${params.toString()}`, { method: "POST", body: formData });
    if (response.status === 429) return { status: "rate_limited", publicMessage: "Trop d'envois. Reessayez plus tard." };
    if (response.status === 422) return { status: "disabled", publicMessage: "L'ajout de documents n'est pas disponible pour ce produit." };
    if (response.status === 413) return { status: "error", publicMessage: "Fichier trop volumineux (5 Mo maximum)." };
    if (!response.ok) return { status: "error", publicMessage: "Document refuse: format PDF, JPEG ou PNG, 5 Mo maximum, 5 documents par demande." };
    return { status: "success", publicMessage: "Document recu. Il sera verifie puis transmis au courtier partenaire responsable de votre demande." };
  } catch (error) {
    return { status: "error", publicMessage: error instanceof Error ? "API publique temporairement indisponible." : "Envoi impossible." };
  }
}

async function readPublic<T>(path: string, emptyValue: T): Promise<PublicApiState<T>> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}${path}`, { cache: "no-store" });
    if (!response.ok) return { status: "error", data: emptyValue, error: `api_${response.status}`, publicMessage: "Service public temporairement indisponible." };
    const data = await response.json() as T;
    const empty = Array.isArray(data) && data.length === 0;
    return { status: empty ? "empty" : "success", data };
  } catch (error) {
    return {
      status: "error",
      data: emptyValue,
      error: error instanceof Error ? error.message : "api_unavailable",
      publicMessage: "API publique temporairement indisponible."
    };
  }
}

/** Public country exposed by GET /countries (only publicly activated countries are returned). */
export interface PublicCountrySummary {
  id: string;
  isoCode: string;
  name: string;
  currency?: string;
  status?: string;
}

/** Public product exposed by GET /countries/:code/products, with its per-product activations. */
export interface PublicProductSummary {
  id: string;
  key: string;
  name: string;
  comparisonEnabled: boolean;
  quoteEnabled: boolean;
}

export function listPublicCountries() {
  return readPublic<PublicCountrySummary[]>("/countries", []);
}

export function listPublicProducts(countryCode: string) {
  return readPublic<PublicProductSummary[]>(`/countries/${encodeURIComponent(countryCode)}/products`, []);
}

/** Query parameters accepted by the public offers list (filters, sort, visitor priority). */
export const publicOfferFilterKeys = ["minPrice", "maxPrice", "broker", "minGuaranteeLevel", "maxDeductible", "maxProcessingDays", "insurer", "guarantee", "paymentFlexibility", "priority", "sort"] as const;

export function publicOfferQuery(filters: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of publicOfferFilterKeys) {
    const value = filters[key];
    const text = Array.isArray(value) ? value[0] : value;
    if (text && text.trim()) params.set(key, text.trim());
  }
  return params;
}

export function listPublicOffers(countryCode: string, productKey: string, filters: Record<string, string | string[] | undefined> = {}) {
  const query = publicOfferQuery(filters).toString();
  return readPublic<OfferSummary[]>(`/countries/${countryCode}/products/${productKey}/offers${query ? `?${query}` : ""}`, []);
}

export function getPublicOffer(offerId: string) {
  return readPublic<OfferDetail | null>(`/offers/${encodeURIComponent(offerId)}`, null);
}

export function comparePublicOffers(ids: string[], priority?: string) {
  const params = new URLSearchParams({ ids: ids.join(",") });
  if (priority) params.set("priority", priority);
  return readPublic<OfferCompareResponse | null>(`/offers/compare?${params.toString()}`, null);
}

export function getPublicQuoteForm(countryCode: string, productKey: string) {
  return readPublic<PublicQuoteFormState | null>(`/countries/${countryCode}/products/${productKey}/quote-form`, null);
}

export async function submitPublicQuoteRequest(input: QuoteRequestCreateDto): Promise<PublicQuoteSubmitState> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}/quote-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    if (response.status === 429) {
      return { status: "rate_limited", error: "rate_limited", publicMessage: "Trop de demandes. Reessayez plus tard." };
    }
    if (!response.ok) {
      return { status: "error", error: `api_${response.status}`, publicMessage: "La demande de devis ne peut pas etre envoyee avec ces informations." };
    }
    const body = await response.json() as { publicReference?: string; message?: string };
    if (!body.publicReference) {
      return { status: "error", error: "missing_public_reference", publicMessage: "La confirmation n'a pas pu etre generee." };
    }
    return {
      status: "success",
      publicReference: body.publicReference,
      ...(typeof (body as { verificationToken?: unknown }).verificationToken === "string" ? { verificationToken: (body as { verificationToken: string }).verificationToken } : {}),
      // The server message states how many brokers received the request (spec 042).
      publicMessage: body.message ?? "Demande transmise selon votre consentement."
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "api_unavailable",
      publicMessage: "API publique temporairement indisponible."
    };
  }
}
