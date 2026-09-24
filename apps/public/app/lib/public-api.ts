import type { OfferCompareResponse, OfferDetail, OfferSummary, QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { QuoteDocumentsResponse } from "../../../../packages/shared/contracts/quote-document.contracts";
import type { PartnerApplicationCreateDto } from "../../../../packages/shared/contracts/partner-application.contracts";
import type {
  ContactMessageCreateDto,
  PublicCountryDirectoryItem as ContractCountryDirectoryItem,
  PublicInsurerSummary as ContractInsurerSummary,
  PublicPartnerDetail as ContractPartnerDetail,
  PublicPartnerSummary as ContractPartnerSummary,
  PublicPlanPrice,
  PublicPlansResponse,
  PublicStats as ContractPublicStats,
  WaitlistSubscribeDto
} from "../../../../packages/shared/contracts/public-site.contracts";
import type frMessages from "../../messages/fr.json";

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

/**
 * Every public message carries a translation key next to its French fallback: the key drives the
 * localised rendering, the fallback keeps the surface readable if the namespace is not mounted.
 */
export type ApiMessageKey = keyof (typeof frMessages)["Api"];

export interface PublicApiState<T> {
  status: "success" | "empty" | "error";
  data: T;
  error?: string;
  publicMessage?: string;
  messageKey?: ApiMessageKey;
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
  messageKey: ApiMessageKey;
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

export async function requestVisitorAi(assistType: string, body: Record<string, unknown>): Promise<{ status: "queued" | "error" | "rate_limited" | "disabled"; interaction?: VisitorAiInteraction; publicMessage?: string; messageKey?: ApiMessageKey }> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}/ai/visitor/${encodeURIComponent(assistType)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 429) return { status: "rate_limited", messageKey: "aiRateLimited", publicMessage: "Trop de demandes d'assistance. Reessayez plus tard." };
    if (response.status === 422) return { status: "disabled", messageKey: "aiDisabled", publicMessage: "L'assistant IA n'est pas disponible pour ce pays ou ce produit." };
    if (!response.ok) return { status: "error", messageKey: "aiUnavailable", publicMessage: "L'assistant IA est temporairement indisponible." };
    return { status: "queued", interaction: await response.json() as VisitorAiInteraction };
  } catch {
    return { status: "error", messageKey: "aiUnavailable", publicMessage: "L'assistant IA est temporairement indisponible." };
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
  messageKey: ApiMessageKey;
}

export function listQuoteDocuments(publicReference: string, token: string) {
  const params = new URLSearchParams({ token });
  return readPublic<QuoteDocumentsResponse | null>(`/quote-requests/${encodeURIComponent(publicReference)}/documents?${params.toString()}`, null);
}

export async function uploadQuoteDocument(publicReference: string, token: string, formData: FormData): Promise<PublicQuoteDocumentUploadState> {
  try {
    const params = new URLSearchParams({ token });
    const response = await fetch(`${PUBLIC_API_BASE_URL}/quote-requests/${encodeURIComponent(publicReference)}/documents?${params.toString()}`, { method: "POST", body: formData });
    if (response.status === 429) return { status: "rate_limited", messageKey: "documentRateLimited", publicMessage: "Trop d'envois. Reessayez plus tard." };
    if (response.status === 422) return { status: "disabled", messageKey: "documentDisabled", publicMessage: "L'ajout de documents n'est pas disponible pour ce produit." };
    if (response.status === 413) return { status: "error", messageKey: "documentTooLarge", publicMessage: "Fichier trop volumineux (5 Mo maximum)." };
    if (!response.ok) return { status: "error", messageKey: "documentRejected", publicMessage: "Document refuse: format PDF, JPEG ou PNG, 5 Mo maximum, 5 documents par demande." };
    return { status: "success", messageKey: "documentReceived", publicMessage: "Document recu. Il sera verifie puis transmis au courtier partenaire responsable de votre demande." };
  } catch (error) {
    return error instanceof Error
      ? { status: "error", messageKey: "apiUnavailable", publicMessage: "API publique temporairement indisponible." }
      : { status: "error", messageKey: "uploadFailed", publicMessage: "Envoi impossible." };
  }
}

/** Next.js extends RequestInit with its own caching hints; the DOM type does not know about them. */
type PublicFetchInit = RequestInit & { next?: { revalidate?: number } };

async function readPublic<T>(path: string, emptyValue: T, init?: PublicFetchInit): Promise<PublicApiState<T>> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}${path}`, init ?? { cache: "no-store" });
    if (!response.ok) {
      return {
        status: "error",
        data: emptyValue,
        error: `api_${response.status}`,
        messageKey: response.status === 404 ? "notFound" : "serviceUnavailable",
        publicMessage: response.status === 404 ? "Contenu indisponible pour le moment." : "Service public temporairement indisponible."
      };
    }
    const data = await response.json() as T;
    const empty = Array.isArray(data) && data.length === 0;
    return { status: empty ? "empty" : "success", data };
  } catch (error) {
    return {
      status: "error",
      data: emptyValue,
      error: error instanceof Error ? error.message : "api_unavailable",
      messageKey: "apiUnavailable",
      publicMessage: "API publique temporairement indisponible."
    };
  }
}

/**
 * Cached read for the slow-moving public catalogue (directory, stats, partners, insurers, plans).
 * Offers, quote forms, request status and documents keep `no-store` so nothing stale is shown.
 */
export function readPublicCached<T>(path: string, emptyValue: T, revalidate = 600): Promise<PublicApiState<T>> {
  return readPublic<T>(path, emptyValue, { next: { revalidate } });
}

/** Public country exposed by GET /countries (only publicly activated countries are returned). */
export interface PublicCountrySummary {
  id: string;
  isoCode: string;
  name: string;
  currency?: string;
  languages?: string[];
  timezone?: string;
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
      return { status: "rate_limited", error: "rate_limited", messageKey: "rateLimited", publicMessage: "Trop de demandes. Reessayez plus tard." };
    }
    if (!response.ok) {
      return { status: "error", error: `api_${response.status}`, messageKey: "quoteRejected", publicMessage: "La demande de devis ne peut pas etre envoyee avec ces informations." };
    }
    const body = await response.json() as { publicReference?: string; message?: string };
    if (!body.publicReference) {
      return { status: "error", error: "missing_public_reference", messageKey: "confirmationFailed", publicMessage: "La confirmation n'a pas pu etre generee." };
    }
    return {
      status: "success",
      publicReference: body.publicReference,
      ...(typeof (body as { verificationToken?: unknown }).verificationToken === "string" ? { verificationToken: (body as { verificationToken: string }).verificationToken } : {}),
      messageKey: "quoteTransmitted",
      // The server message states how many brokers received the request (spec 042).
      publicMessage: body.message ?? "Demande transmise selon votre consentement."
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "api_unavailable",
      messageKey: "apiUnavailable",
      publicMessage: "API publique temporairement indisponible."
    };
  }
}

/* ------------------------------------------------------------------ *
 * Endpoints built in parallel by the catalogue work package.
 * Every wrapper is tolerant: a 404 or a network failure returns an error
 * state, never a thrown exception, so a page still renders.
 * The request/response shapes are declared locally on purpose while the
 * shared contracts are being written concurrently.
 * ------------------------------------------------------------------ */

export type CountryAvailability = "open" | "pilot" | "waitlist";

/**
 * The four public catalogue reads below alias the shared zod contracts instead of redeclaring them.
 * They were hand-written first and drifted: the partner summary spelled the licence field the
 * British way while the API sends `licenseNumber`, the insurer summary had no offer count, and the
 * statistics used entirely different names. Each mismatch renders as a blank field rather than a
 * type error, so the contract is the only safe source of these shapes.
 */
export type PublicCountryDirectoryItem = ContractCountryDirectoryItem;

export type PublicStats = ContractPublicStats;

export type PublicPartnerSummary = ContractPartnerSummary;

export type PublicPartnerDetail = ContractPartnerDetail;



export type PublicInsurerSummary = ContractInsurerSummary;

/**
 * Re-exported from the shared contract rather than redeclared: `GET /partners/plans` answers
 * `{ items, notice }` (spec 045, `publicPlansResponseSchema`), each item carrying the monthly
 * subscription, the per-lead price and the setup fee for one plan in one country. There is no
 * `name`/`features` on the wire - that editorial copy lives in `app/content/brokers.ts` instead.
 */
export type { PublicPlanPrice, PublicPlansResponse };

export interface PublicProductDetail {
  key: string;
  name: string;
  countryIso: string;
  summary?: string;
  guarantees?: Array<{ key: string; label: string; detail?: string }>;
  exclusions?: string[];
  requiredDocuments?: string[];
  comparisonEnabled: boolean;
  quoteEnabled: boolean;
}

/**
 * Alias of the shared `waitlistSubscribeSchema` input (spec 045). The endpoint requires an explicit
 * consent literal plus the honeypot and session fields every public submission carries, so the form
 * must send exactly what the contract declares rather than a look-alike shape.
 */
export type WaitlistSubmission = WaitlistSubscribeDto;

/** Alias of the shared `contactMessageCreateSchema` input (spec 045). */
export type ContactSubmission = ContactMessageCreateDto;

/**
 * Alias of the shared `partnerApplicationCreateSchema` input (spec 045): a broker application is
 * evidence of intent, reviewed by compliance, and never creates a `PartnerTenant` by itself. Kept
 * under this name (rather than importing `PartnerApplicationCreateDto` at call sites) so the public
 * app has one vocabulary for "what the apply form submits".
 */
export type PartnerApplicationSubmission = PartnerApplicationCreateDto;

export interface PublicSubmitState {
  status: "success" | "error" | "rate_limited";
  publicMessage: string;
  messageKey: ApiMessageKey;
  error?: string;
  /**
   * The reference the server assigned to the submission, when it returned one. A visitor who has
   * just sent a contact message or a broker application needs something to quote when they follow
   * up, so the server's own reference is surfaced rather than a client-generated identifier.
   */
  publicReference?: string;
  /** Steps the server states after accepting a submission, shown verbatim on the success screen. */
  nextSteps?: string[];
}

async function submitPublic(path: string, body: unknown, successKey: ApiMessageKey, failureKey: ApiMessageKey, successText: string, failureText: string): Promise<PublicSubmitState> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 429) {
      return { status: "rate_limited", messageKey: "rateLimited", publicMessage: "Trop de demandes. Reessayez plus tard.", error: "rate_limited" };
    }
    if (!response.ok) {
      return { status: "error", messageKey: failureKey, publicMessage: failureText, error: `api_${response.status}` };
    }
    // The public POST endpoints answer with their own French message, a reference and sometimes the
    // next steps. Prefer what the server said over the local fallback text, and never fail on a
    // body that cannot be parsed: the submission itself already succeeded.
    const body_ = await response.json().catch(() => null) as { publicReference?: unknown; message?: unknown; nextSteps?: unknown } | null;
    const reference = typeof body_?.publicReference === "string" ? body_.publicReference : undefined;
    const serverMessage = typeof body_?.message === "string" ? body_.message : undefined;
    const nextSteps = Array.isArray(body_?.nextSteps) ? body_.nextSteps.filter((step): step is string => typeof step === "string") : undefined;
    return {
      status: "success",
      messageKey: successKey,
      publicMessage: serverMessage ?? successText,
      ...(reference ? { publicReference: reference } : {}),
      ...(nextSteps && nextSteps.length > 0 ? { nextSteps } : {})
    };
  } catch (error) {
    return {
      status: "error",
      messageKey: "apiUnavailable",
      publicMessage: "API publique temporairement indisponible.",
      error: error instanceof Error ? error.message : "api_unavailable"
    };
  }
}

/**
 * GET /countries/directory. Falls back to GET /countries mapped to `availability: "open"` while the
 * directory endpoint is not deployed, so the site works before the backend lands.
 */
export async function listCountryDirectory(): Promise<PublicApiState<PublicCountryDirectoryItem[]>> {
  const directory = await readPublicCached<PublicCountryDirectoryItem[]>("/countries/directory", []);
  if (directory.status === "success") return directory;

  const countries = await listPublicCountries();
  if (countries.status === "error") {
    return { status: "error", data: [], error: countries.error ?? "directory_unavailable", messageKey: countries.messageKey ?? "serviceUnavailable", publicMessage: countries.publicMessage ?? "Service public temporairement indisponible." };
  }
  // The legacy endpoint carries no currency, language list or availability, and the directory
  // contract requires them. The fallback states the conservative truth: a country returned by the
  // public list is open, and an unknown currency or language list is empty rather than guessed.
  const mapped: PublicCountryDirectoryItem[] = countries.data.map((country) => ({
    isoCode: country.isoCode,
    name: country.name,
    currency: country.currency ?? "",
    languages: country.languages ?? [],
    availability: "open",
    comparisonEnabled: true,
    quoteEnabled: true
  }));
  return { status: mapped.length === 0 ? "empty" : "success", data: mapped };
}

export function getPublicStats(): Promise<PublicApiState<PublicStats | null>> {
  return readPublicCached<PublicStats | null>("/public-stats", null);
}

export function listCountryPartners(countryCode: string): Promise<PublicApiState<PublicPartnerSummary[]>> {
  return readPublicCached<PublicPartnerSummary[]>(`/countries/${encodeURIComponent(countryCode)}/partners`, []);
}

/** The individual read answers the detail shape: the summary plus resolved products and a disclaimer. */
export function getCountryPartner(countryCode: string, partnerId: string): Promise<PublicApiState<PublicPartnerDetail | null>> {
  return readPublicCached<PublicPartnerDetail | null>(`/countries/${encodeURIComponent(countryCode)}/partners/${encodeURIComponent(partnerId)}`, null);
}

export function listCountryInsurers(countryCode: string): Promise<PublicApiState<PublicInsurerSummary[]>> {
  return readPublicCached<PublicInsurerSummary[]>(`/countries/${encodeURIComponent(countryCode)}/insurers`, []);
}

const emptyPlansResponse: PublicPlansResponse = { items: [], notice: "" };

export function listPartnerPlans(country?: string): Promise<PublicApiState<PublicPlansResponse>> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return readPublicCached<PublicPlansResponse>(`/partners/plans${query}`, emptyPlansResponse);
}

export function getPublicProduct(countryCode: string, productKey: string): Promise<PublicApiState<PublicProductDetail | null>> {
  return readPublicCached<PublicProductDetail | null>(`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}`, null);
}

export function submitWaitlist(body: WaitlistSubmission): Promise<PublicSubmitState> {
  return submitPublic(
    "/waitlist",
    body,
    "waitlistJoined",
    "waitlistFailed",
    "Votre inscription est enregistree. Vous serez informe de l'ouverture publique de ce pays.",
    "Inscription impossible pour le moment."
  );
}

export function submitContact(body: ContactSubmission): Promise<PublicSubmitState> {
  return submitPublic(
    "/contact",
    body,
    "contactSent",
    "contactFailed",
    "Message recu. Notre equipe vous repondra.",
    "Envoi du message impossible pour le moment."
  );
}

/**
 * `POST /partners/applications` answers `partnerApplicationResponseSchema`: a public reference and
 * the next steps the applicant should expect (spec 045 D4/D5: an application is evidence of intent,
 * never a `PartnerTenant`, and a licence copy is requested by e-mail because upload is out of scope).
 * The generic `submitPublic` helper discards the response body, so this reader is bespoke - the same
 * reason `submitPublicQuoteRequest` above does not use it either.
 */
export interface PartnerApplicationSubmitState extends PublicSubmitState {
  publicReference?: string;
  nextSteps?: string[];
}

export async function submitPartnerApplication(body: PartnerApplicationSubmission): Promise<PartnerApplicationSubmitState> {
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}/partners/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 429) {
      return { status: "rate_limited", messageKey: "rateLimited", publicMessage: "Trop de demandes. Reessayez plus tard.", error: "rate_limited" };
    }
    if (!response.ok) {
      return { status: "error", messageKey: "applicationFailed", publicMessage: "Envoi de la candidature impossible pour le moment.", error: `api_${response.status}` };
    }
    const payload = await response.json() as { publicReference?: string; message?: string; nextSteps?: string[] };
    if (!payload.publicReference) {
      return { status: "error", messageKey: "applicationFailed", publicMessage: "Envoi de la candidature impossible pour le moment.", error: "missing_public_reference" };
    }
    return {
      status: "success",
      messageKey: "applicationSent",
      publicMessage: payload.message ?? "Candidature recue. Elle sera etudiee par notre equipe conformite.",
      publicReference: payload.publicReference,
      ...(payload.nextSteps ? { nextSteps: payload.nextSteps } : {})
    };
  } catch (error) {
    return {
      status: "error",
      messageKey: "apiUnavailable",
      publicMessage: "API publique temporairement indisponible.",
      error: error instanceof Error ? error.message : "api_unavailable"
    };
  }
}

export function withdrawQuoteConsent(publicReference: string, token: string): Promise<PublicSubmitState> {
  return submitPublic(
    `/quote-requests/${encodeURIComponent(publicReference)}/consent-withdrawal?token=${encodeURIComponent(token)}`,
    {},
    "consentWithdrawn",
    "consentWithdrawalFailed",
    "Votre retrait de consentement est enregistre.",
    "Le retrait de consentement n'a pas pu etre enregistre avec ce lien."
  );
}
