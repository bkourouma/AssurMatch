import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export interface PublicApiState<T> {
  status: "success" | "empty" | "error";
  data: T;
  error?: string;
  publicMessage?: string;
}

export interface PublicQuoteFormState {
  formDefinitionId: string;
  version: string;
  consent: {
    consentTextId: string;
    version: string;
    contentHash: string;
  };
}

export interface PublicQuoteSubmitState {
  status: "success" | "error" | "rate_limited";
  publicReference?: string;
  error?: string;
  publicMessage: string;
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

export function listPublicCountries() {
  return readPublic<unknown[]>("/countries", []);
}

export function listPublicProducts(countryCode: string) {
  return readPublic<unknown[]>(`/countries/${countryCode}/products`, []);
}

export function listPublicOffers(countryCode: string, productKey: string) {
  return readPublic<unknown[]>(`/countries/${countryCode}/products/${productKey}/offers`, []);
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
    const body = await response.json() as { publicReference?: string };
    if (!body.publicReference) {
      return { status: "error", error: "missing_public_reference", publicMessage: "La confirmation n'a pas pu etre generee." };
    }
    return {
      status: "success",
      publicReference: body.publicReference,
      publicMessage: "Demande transmise selon votre consentement."
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "api_unavailable",
      publicMessage: "API publique temporairement indisponible."
    };
  }
}
