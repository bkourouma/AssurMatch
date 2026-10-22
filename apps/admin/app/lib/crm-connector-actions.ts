"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

/**
 * Spec 077 (admin screen): server actions for /crm-connectors.
 *
 * The signing secret (`crmsec_...`) is returned ONLY inside the action state so the client form can
 * show it once. Neither it nor the auth header value is ever put in a URL, a redirect, a cookie, a
 * log, a revalidation payload or an error message.
 */
export interface CrmSigningSecret {
  kind: "crm_signing_secret";
  label: string;
  value: string;
  restrictions: string[];
}

export interface CrmActionState {
  status: "idle" | "success" | "error";
  message?: string;
  secret?: CrmSigningSecret;
}

const PAGE_PATH = "/crm-connectors";
const REASON_MIN_LENGTH = 8;
const EVENT_TYPES = new Set(["lead.assigned", "lead.status_changed"]);
const STATUSES = new Set(["active", "suspended", "disabled"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADER_NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

interface ApiCall {
  status: number;
  body: unknown;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function listValue(formData: FormData, name: string, allowed: Set<string>): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string" && allowed.has(value));
}

function reasonError(reason: string): CrmActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caracteres, conserve dans l'audit.` };
}

async function callApi(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<ApiCall> {
  const token = await getBackOfficeToken();
  if (!token) return { status: 401, body: null };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/crm-connectors${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  } catch {
    return { status: 0, body: null };
  }
}

/** Keeps a server message readable and never echoes anything that looks like a secret. */
function sanitizeServerMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = (body as { message?: unknown }).message;
  const joined = Array.isArray(raw) ? raw.filter((part): part is string => typeof part === "string").join(" ; ") : typeof raw === "string" ? raw : "";
  const cleaned = joined
    .replace(/(crmsec_|am_pk_|whsec_)[A-Za-z0-9_\-.]+/g, "[masque]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return cleaned || undefined;
}

function failure(call: ApiCall): CrmActionState {
  if (call.status === 403) return { status: "error", message: "Action refusee : MFA ou role insuffisant." };
  if (call.status === 400 || call.status === 422) {
    const detail = sanitizeServerMessage(call.body);
    return { status: "error", message: detail ? `Demande refusee : ${detail}` : "Demande refusee : verifiez les champs saisis." };
  }
  if (call.status === 404) return { status: "error", message: "Connecteur introuvable : rechargez la page." };
  if (call.status === 409) return { status: "error", message: "Conflit : le connecteur a change entre-temps, rechargez la page." };
  return { status: "error", message: "Connecteurs CRM indisponibles." };
}

function guard(call: ApiCall): void {
  if (call.status === 401) redirect(loginRedirect(PAGE_PATH, "session_expired"));
}

function isOk(call: ApiCall): boolean {
  return call.status === 200 || call.status === 201;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function secretState(message: string, body: unknown): CrmActionState {
  const payload = (body ?? {}) as { signingSecret?: unknown; restrictions?: unknown };
  if (typeof payload.signingSecret !== "string") return { status: "success", message };
  return {
    status: "success",
    message,
    secret: { kind: "crm_signing_secret", label: "Secret de signature CRM", value: payload.signingSecret, restrictions: stringArray(payload.restrictions) }
  };
}

export async function createCrmConnectorAction(_previous: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerTenantId = text(formData, "partnerTenantId");
  const name = text(formData, "name");
  const url = text(formData, "url");
  const eventTypes = listValue(formData, "eventTypes", EVENT_TYPES);
  const authHeaderName = text(formData, "authHeaderName");
  const rawValue = formData.get("authHeaderValue");
  const authHeaderValue = typeof rawValue === "string" ? rawValue : "";
  if (!UUID.test(partnerTenantId)) return { status: "error", message: "Choisissez un partenaire." };
  if (!name) return { status: "error", message: "Nom du connecteur obligatoire." };
  if (!url.startsWith("https://")) return { status: "error", message: "L'URL doit commencer par https://." };
  if (eventTypes.length === 0) return { status: "error", message: "Choisissez au moins un evenement." };
  if (Boolean(authHeaderName) !== Boolean(authHeaderValue)) {
    return { status: "error", message: "L'en-tete d'authentification exige un nom et une valeur ensemble." };
  }
  if (authHeaderName && !HEADER_NAME.test(authHeaderName)) return { status: "error", message: "Nom d'en-tete d'authentification invalide." };
  const call = await callApi("", "POST", {
    partnerTenantId,
    name,
    url,
    eventTypes,
    ...(authHeaderName ? { authHeaderName, authHeaderValue } : {}),
    reason
  });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return secretState("Connecteur CRM cree (desactive par defaut).", call.body);
}

export async function updateCrmConnectorStatusAction(_previous: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!UUID.test(id) || !STATUSES.has(status)) return { status: "error", message: "Connecteur introuvable." };
  const call = await callApi(`/${id}`, "PATCH", { status, reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  const label = status === "active" ? "Connecteur active." : status === "suspended" ? "Connecteur suspendu." : "Connecteur desactive.";
  return { status: "success", message: label };
}

export async function rotateCrmConnectorSecretAction(_previous: CrmActionState, formData: FormData): Promise<CrmActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const id = text(formData, "id");
  if (!UUID.test(id)) return { status: "error", message: "Connecteur introuvable." };
  const call = await callApi(`/${id}`, "PATCH", { rotateSecret: true, reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return secretState("Secret de signature renouvele.", call.body);
}
