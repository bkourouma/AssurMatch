import { request } from "@playwright/test";
import { api, itemsOfBody, rec } from "./admin-lot11";
import { applicationSlotsLeft, resetApplicationRateLimit } from "./edge-p0p1-redis";
import { e2eEnv } from "./env";
import type { ApiResult } from "./pro-roles";
import { publicCall } from "./recos-062b";

// Lot 2 / onboarding spec: helpers of the candidature budget (3 per hour per IP for the whole stack, every call
// counts), a payload builder for POST /partners/applications, audit look-ups and a raw document upload.

let resets = 0;

/** Number of times this process reset the candidature bucket (reported at the end of the run). */
export function applicationResetCount(): number {
  return resets;
}

/** Makes sure `needed` (at most 3) submissions fit in the bucket, resetting ONLY the candidature counter when not. */
export function ensureSlots(needed: number): void {
  if (needed > 3) throw new Error("a batch is at most 3 submissions");
  if (applicationSlotsLeft() >= needed) return;
  resetApplicationRateLimit();
  resets += 1;
}

export function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export interface ApplicationPayload extends Record<string, unknown> {
  legalName: string;
  countryCode: string;
  licenseNumber: string;
  licenseExpiresAt: string;
  productKeys: string[];
  monthlyCapacity: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  desiredPlan: "starter" | "pro" | "enterprise";
  consent: true;
}

export function applicationPayload(tag: string, overrides: Record<string, unknown> = {}): ApplicationPayload {
  return {
    legalName: `${tag} Courtage`,
    countryCode: "CI",
    licenseNumber: `CI-AGR-L2-${tag.replace(/[^A-Za-z0-9]/gu, "").slice(-12)}`,
    licenseIssuingAuthority: "Direction des Assurances CI",
    licenseExpiresAt: isoDay(400),
    productKeys: ["auto"],
    monthlyCapacity: 40,
    contactName: "Awa Test",
    contactEmail: `cand.${tag.replace(/[^A-Za-z0-9]/gu, "").toLowerCase().slice(-14)}@e2e-courtage.test`,
    contactPhone: "+2250701020304",
    desiredPlan: "starter",
    consent: true,
    sessionId: crypto.randomUUID(),
    locale: "fr",
    ...overrides
  } as ApplicationPayload;
}

/** POST /partners/applications (public, no session). Costs one slot unless the honeypot is filled. */
export function postApplication(payload: Record<string, unknown>): Promise<ApiResult> {
  return publicCall("POST", "/partners/applications", { json: payload });
}

export function referenceOfResponse(result: ApiResult): string {
  return String(rec(result.body).publicReference ?? "");
}

export interface AuditRow {
  action: string;
  targetId: string;
  result: string;
  reason: string | null;
  occurredAt: string;
  context: Record<string, unknown>;
}

export async function auditRows(token: string, action: string, targetId?: string): Promise<AuditRow[]> {
  const query = `action=${encodeURIComponent(action)}${targetId ? `&targetId=${encodeURIComponent(targetId)}` : ""}`;
  const result = await api(token, "GET", `/admin/audit-logs?${query}`);
  return itemsOfBody(result.body) as unknown as AuditRow[];
}

/** Id of the admin application whose public reference is `reference`. */
export async function applicationIdByReference(token: string, reference: string): Promise<string> {
  const result = await api(token, "GET", "/admin/partners/applications");
  const found = itemsOfBody(result.body).find((item) => item.publicReference === reference);
  if (!found) throw new Error(`application ${reference} not found in /admin/partners/applications`);
  return String(found.id);
}

export async function applicationsByLegalName(token: string, fragment: string): Promise<Array<Record<string, unknown>>> {
  const result = await api(token, "GET", "/admin/partners/applications");
  return itemsOfBody(result.body).filter((item) => String(item.legalName).includes(fragment));
}

export interface RawUploadOptions {
  file?: { name: string; mimeType: string; buffer: Buffer };
  fields: Record<string, string>;
  uploadHeader?: boolean;
}

/** POST /admin/partners/:id/documents straight at the API (the admin route handler adds the CSRF header itself). */
export async function rawUpload(token: string, partnerId: string, options: RawUploadOptions): Promise<ApiResult> {
  const context = await request.newContext({ baseURL: e2eEnv.apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = { ...options.fields };
    if (options.file) multipart.file = options.file;
    const response = await context.fetch(`/admin/partners/${partnerId}/documents`, {
      method: "POST",
      multipart,
      headers: options.uploadHeader ? { "x-assurmatch-upload": "1" } : {}
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // plain text refusal
    }
    return { status: response.status(), body, text };
  } finally {
    await context.dispose();
  }
}

/** A buffer of `size` bytes starting with a PDF header, to hit the size limit. */
export function bigPdf(name: string, size: number): { name: string; mimeType: string; buffer: Buffer } {
  const head = Buffer.from("%PDF-1.4\n", "latin1");
  const buffer = Buffer.alloc(size, 0x20);
  head.copy(buffer, 0);
  return { name, mimeType: "application/pdf", buffer };
}

export { api, itemsOfBody, rec };
