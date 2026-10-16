"use server";

import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

/**
 * Spec 062 (D-10): server actions of the data-request queue (compliance_admin / super_admin; the
 * API enforces the roles). Notices travel through `?notice=` only: the visitor's detail text, the
 * decision note and the e-mail of the visitor are never put in a URL. `start-erasure` only creates
 * the spec 046 erasure preview; approval and execution stay in the retention batch flow.
 */

const LIST_PAGE = "/compliance/data-requests";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 1000;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function detailUrl(id: string, notice: string): string {
  return `${LIST_PAGE}/${id}?notice=${encodeURIComponent(notice)}`;
}

async function callDataRequestApi(path: string, body: Record<string, unknown>): Promise<number> {
  const token = await getBackOfficeToken();
  if (!token) return 401;
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}${path}`, {
      method: "POST",
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
  if (status === 400 || status === 422) return "invalid";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "error";
}

function requestId(formData: FormData): string {
  const id = stringValue(formData.get("id"));
  if (!UUID.test(id)) redirect(`${LIST_PAGE}?notice=invalid`);
  return id;
}

async function runAction(id: string, action: string, body: Record<string, unknown>, success: string): Promise<void> {
  const status = await callDataRequestApi(`/admin/data-requests/${id}/${action}`, body);
  if (status === 401) redirect(loginRedirect(`${LIST_PAGE}/${id}`, "session_expired"));
  redirect(detailUrl(id, outcome(status, success)));
}

/** `received -> in_review`. */
export async function takeDataRequest(formData: FormData): Promise<void> {
  const id = requestId(formData);
  await runAction(id, "take", {}, "taken");
}

/** Closes the request as completed; the note is optional and internal. The visitor receives a closing e-mail. */
export async function completeDataRequest(formData: FormData): Promise<void> {
  const id = requestId(formData);
  const note = stringValue(formData.get("note"));
  if (note.length > NOTE_MAX) redirect(detailUrl(id, "note_too_long"));
  // Erasure request closed with no erasure batch: the explicit acknowledgment is checked here, not only in the browser.
  if (stringValue(formData.get("requireNoErasureAck")) === "yes" && stringValue(formData.get("acknowledgeNoErasure")) !== "yes") {
    redirect(detailUrl(id, "no_erasure_ack_required"));
  }
  await runAction(id, "complete", note ? { note } : {}, "completed");
}

/** Rejects the request: the internal note is mandatory (checked here and by the API). */
export async function rejectDataRequest(formData: FormData): Promise<void> {
  const id = requestId(formData);
  const note = stringValue(formData.get("note"));
  if (note.length === 0) redirect(detailUrl(id, "note_required"));
  if (note.length > NOTE_MAX) redirect(detailUrl(id, "note_too_long"));
  await runAction(id, "reject", { note }, "rejected");
}

/**
 * Creates the spec 046 erasure PREVIEW for this request (type erasure only). Nothing is erased:
 * the batch is approved and executed from the retention batch list. Requires an explicit acknowledgment.
 */
export async function startDataRequestErasure(formData: FormData): Promise<void> {
  const id = requestId(formData);
  if (stringValue(formData.get("acknowledge")) !== "yes") redirect(detailUrl(id, "confirmation_required"));
  await runAction(id, "start-erasure", {}, "erasure_started");
}
