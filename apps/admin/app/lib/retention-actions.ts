"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";
import { RETENTION_CATEGORY_KEYS, type RetentionCategoryKey } from "./admin-api";

/**
 * Spec 046 (FR-012): server actions of the retention page. Notices travel through `?retention=`
 * only; an erasure e-mail is forwarded to the API and never echoed back in a URL or a notice.
 */

const PAGE = "/compliance/retention";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Mirrors `reasonCarriesContact` of the shared contract: 8+ digits (phone), ISO dates excepted. */
const PHONE_IN_TEXT = /\+?\d(?:[\s.+-]?\d){7,}/;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const CATEGORIES = new Set<string>(RETENTION_CATEGORY_KEYS);
const REASON_MIN = 8;
const REASON_MAX = 500;
const DAYS_MIN = 30;
const DAYS_MAX = 3650;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function countryIdValue(formData: FormData): string | undefined {
  const countryId = stringValue(formData.get("countryId"));
  return UUID.test(countryId) ? countryId : undefined;
}

function pageUrl(notice: string, countryId?: string): string {
  const params = new URLSearchParams();
  if (countryId) params.set("countryId", countryId);
  params.set("retention", notice);
  return `${PAGE}?${params.toString()}`;
}

/** Returns a notice key when the reason is unusable, so the API never receives nor stores an e-mail or a phone number in it. */
function reasonProblem(reason: string): string | undefined {
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return "invalid_reason";
  if (EMAIL_IN_TEXT.test(reason) || PHONE_IN_TEXT.test(reason.replace(ISO_DATE, " "))) return "reason_contact";
  return undefined;
}

async function callRetentionApi(path: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<number> {
  const token = await getBackOfficeToken();
  if (!token) return 401;
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    return response.status;
  } catch {
    return 0;
  }
}

function outcome(status: number, success: string): string {
  if (status === 200 || status === 201) return success;
  if (status === 400) return "invalid";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "disabled";
  return "error";
}

async function upsertPolicy(formData: FormData, retentionDays: number | null, success: string): Promise<void> {
  const countryId = countryIdValue(formData);
  const category = stringValue(formData.get("category"));
  const reason = stringValue(formData.get("reason"));
  if (!CATEGORIES.has(category)) redirect(pageUrl("invalid", countryId));
  const problem = reasonProblem(reason);
  if (problem) redirect(pageUrl(problem, countryId));
  const status = await callRetentionApi("/admin/retention/policies", "PUT", {
    ...(countryId ? { countryId } : {}),
    category,
    retentionDays,
    reason
  });
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(pageUrl(outcome(status, success), countryId));
}

/** Sets a global or country override of a category duration (30 to 3650 days). */
export async function savePolicyOverride(formData: FormData): Promise<void> {
  const days = Number(stringValue(formData.get("retentionDays")));
  if (!Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) redirect(pageUrl("invalid_days", countryIdValue(formData)));
  await upsertPolicy(formData, days, "policy_saved");
}

/** Removes the override of the selected level; the next level (country > global > default) applies again. */
export async function removePolicyOverride(formData: FormData): Promise<void> {
  await upsertPolicy(formData, null, "policy_removed");
}

/** Freezes a retention batch (counts only). Changes no personal data and works with the flag off. */
export async function previewRetention(formData: FormData): Promise<void> {
  const countryId = countryIdValue(formData);
  const reason = stringValue(formData.get("reason"));
  const categories = formData.getAll("categories").filter((value): value is RetentionCategoryKey => typeof value === "string" && CATEGORIES.has(value));
  const problem = reasonProblem(reason);
  if (problem) redirect(pageUrl(problem));
  const status = await callRetentionApi("/admin/retention/batches/preview", "POST", {
    ...(countryId ? { countryId } : {}),
    ...(categories.length > 0 ? { categories: [...new Set(categories)] } : {}),
    reason
  });
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(pageUrl(outcome(status, "preview_created")));
}

/**
 * Freezes an erasure batch for one person, by public reference or by e-mail. The e-mail is only
 * forwarded to the API for the lookup: it is not stored on the batch and never put in the redirect.
 */
export async function previewErasure(formData: FormData): Promise<void> {
  const lookup = stringValue(formData.get("lookup"));
  const identifier = stringValue(formData.get("identifier"));
  const reason = stringValue(formData.get("reason"));
  if ((lookup !== "public_reference" && lookup !== "email") || identifier.length === 0 || identifier.length > 254) redirect(pageUrl("invalid_subject"));
  if (lookup === "email" && !EMAIL_IN_TEXT.test(identifier)) redirect(pageUrl("invalid_subject"));
  if (lookup === "public_reference" && identifier.length > 120) redirect(pageUrl("invalid_subject"));
  const problem = reasonProblem(reason);
  if (problem) redirect(pageUrl(problem));
  const status = await callRetentionApi("/admin/retention/batches/erasure-preview", "POST", {
    ...(lookup === "email" ? { email: identifier.toLowerCase() } : { publicReference: identifier }),
    reason
  });
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(pageUrl(outcome(status, "erasure_created")));
}

/** Approves a previewed, unexpired batch. With `retention_purge_enabled` off the API refuses (422) and marks it refused. */
export async function approveBatch(formData: FormData): Promise<void> {
  const batchId = stringValue(formData.get("batchId"));
  const reason = stringValue(formData.get("reason"));
  if (!UUID.test(batchId)) redirect(pageUrl("invalid"));
  const problem = reasonProblem(reason);
  if (problem) redirect(pageUrl(problem));
  const status = await callRetentionApi(`/admin/retention/batches/${batchId}/approve`, "POST", { reason });
  if (status === 401) redirect(loginRedirect(PAGE, "session_expired"));
  redirect(pageUrl(outcome(status, "batch_executed")));
}
