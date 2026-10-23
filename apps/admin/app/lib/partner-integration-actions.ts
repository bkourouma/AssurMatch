"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

/**
 * Spec 074 (admin screen): server actions for /partner-integrations.
 *
 * Secrets (`rawKey`, `signingSecret`) are returned ONLY inside the action state so the client form
 * can show them once. They are never put in a URL, a redirect, a cookie, a log, a revalidation
 * payload or an error message.
 */
export interface IntegrationSecret {
  kind: "api_key" | "webhook_signing_secret";
  label: string;
  value: string;
  restrictions: string[];
}

export interface IntegrationActionState {
  status: "idle" | "success" | "error";
  message?: string;
  secret?: IntegrationSecret;
}

const PAGE_PATH = "/partner-integrations";
const REASON_MIN_LENGTH = 8;
const API_SCOPES = new Set(["leads:read_assigned", "notifications:read", "webhooks:manage"]);
const EVENT_TYPES = new Set(["lead.assigned", "lead.status_changed", "notification.failed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ApiCall {
  status: number;
  body: unknown;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function listValue(formData: FormData, name: string, allowed: Set<string>): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string" && allowed.has(value));
}

function reasonError(reason: string): IntegrationActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caracteres, conserve dans l'audit.` };
}

async function callApi(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<ApiCall> {
  const token = await getBackOfficeToken();
  if (!token) return { status: 401, body: null };
  try {
    const response = await fetch(`${backOfficeApiBaseUrl()}/admin/partner-integrations${path}`, {
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
    .replace(/(am_pk_|whsec_)[A-Za-z0-9_\-.]+/g, "[masque]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return cleaned || undefined;
}

function failure(call: ApiCall): IntegrationActionState {
  if (call.status === 403) return { status: "error", message: "Action refusee : MFA ou role insuffisant." };
  if (call.status === 400 || call.status === 422) {
    const detail = sanitizeServerMessage(call.body);
    return { status: "error", message: detail ? `Demande refusee : ${detail}` : "Demande refusee : verifiez les champs saisis." };
  }
  if (call.status === 404) return { status: "error", message: "Element introuvable : rechargez la page." };
  return { status: "error", message: "Integrations indisponibles." };
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

export async function createPartnerApiKeyAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerTenantId = text(formData, "partnerTenantId");
  const name = text(formData, "name");
  const scopes = listValue(formData, "scopes", API_SCOPES);
  if (!UUID.test(partnerTenantId)) return { status: "error", message: "Choisissez un partenaire." };
  if (!name) return { status: "error", message: "Nom de cle obligatoire." };
  if (scopes.length === 0) return { status: "error", message: "Choisissez au moins un scope." };
  const call = await callApi("/api-keys", "POST", { partnerTenantId, name, scopes, reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  const payload = (call.body ?? {}) as { rawKey?: unknown; restrictions?: unknown };
  revalidatePath(PAGE_PATH);
  if (typeof payload.rawKey !== "string") return { status: "success", message: "Cle API creee." };
  return {
    status: "success",
    message: "Cle API creee.",
    secret: { kind: "api_key", label: "Cle API", value: payload.rawKey, restrictions: stringArray(payload.restrictions) }
  };
}

export async function revokePartnerApiKeyAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const id = text(formData, "id");
  if (!UUID.test(id)) return { status: "error", message: "Cle introuvable." };
  const call = await callApi(`/api-keys/${id}/revoke`, "POST", { reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return { status: "success", message: "Cle API revoquee." };
}

export async function createPartnerWebhookEndpointAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerTenantId = text(formData, "partnerTenantId");
  const url = text(formData, "url");
  const description = text(formData, "description");
  const eventTypes = listValue(formData, "eventTypes", EVENT_TYPES);
  if (!UUID.test(partnerTenantId)) return { status: "error", message: "Choisissez un partenaire." };
  if (!url.startsWith("https://")) return { status: "error", message: "L'URL doit commencer par https://." };
  if (eventTypes.length === 0) return { status: "error", message: "Choisissez au moins un evenement." };
  const call = await callApi("/webhook-endpoints", "POST", {
    partnerTenantId,
    url,
    ...(description ? { description } : {}),
    eventTypes,
    reason
  });
  guard(call);
  if (!isOk(call)) return failure(call);
  const payload = (call.body ?? {}) as { signingSecret?: unknown; restrictions?: unknown };
  revalidatePath(PAGE_PATH);
  if (typeof payload.signingSecret !== "string") return { status: "success", message: "Endpoint webhook cree (desactive par defaut)." };
  return {
    status: "success",
    message: "Endpoint webhook cree (desactive par defaut).",
    secret: { kind: "webhook_signing_secret", label: "Secret de signature", value: payload.signingSecret, restrictions: stringArray(payload.restrictions) }
  };
}

export async function updatePartnerWebhookEndpointStatusAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!UUID.test(id) || (status !== "active" && status !== "suspended")) return { status: "error", message: "Endpoint introuvable." };
  const call = await callApi(`/webhook-endpoints/${id}`, "PATCH", { status, reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return { status: "success", message: status === "active" ? "Endpoint active." : "Endpoint suspendu." };
}

export async function createPartnerWebhookAllowlistAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerTenantId = text(formData, "partnerTenantId");
  const origin = text(formData, "origin");
  const path = text(formData, "path");
  if (!UUID.test(partnerTenantId)) return { status: "error", message: "Choisissez un partenaire." };
  if (!origin.startsWith("https://")) return { status: "error", message: "L'origine doit commencer par https://." };
  if (path && !path.startsWith("/")) return { status: "error", message: "Le chemin doit commencer par /." };
  const call = await callApi("/webhook-allowlist", "POST", { partnerTenantId, origin, ...(path ? { path } : {}), reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return { status: "success", message: "Origine ajoutee a la liste d'autorisation." };
}

export async function revokePartnerWebhookAllowlistAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const id = text(formData, "id");
  if (!UUID.test(id)) return { status: "error", message: "Origine introuvable." };
  const call = await callApi(`/webhook-allowlist/${id}/revoke`, "POST", { reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return { status: "success", message: "Origine revoquee." };
}

function testEventState(body: unknown): IntegrationActionState {
  const result = (body ?? {}) as { outcome?: unknown; responseClass?: unknown; durationMs?: unknown };
  const responseClass = typeof result.responseClass === "string" ? result.responseClass : "";
  const duration = typeof result.durationMs === "number" ? ` en ${result.durationMs} ms` : "";
  if (result.outcome === "delivered") {
    return { status: "success", message: `Evenement de test livre${duration}${responseClass ? ` (reponse ${responseClass})` : ""}.` };
  }
  if (result.outcome === "refused") {
    if (responseClass === "feature_disabled") return { status: "error", message: "Envoi sortant desactive par le flag partner_webhooks_enabled." };
    if (responseClass === "rate_limited") return { status: "error", message: "Limite d'envois de test atteinte : reessayez plus tard." };
    if (responseClass === "endpoint_policy_blocked") return { status: "error", message: "Envoi bloque par la politique de l'endpoint (HTTPS et liste d'autorisation)." };
    return { status: "error", message: "Envoi de test refuse." };
  }
  return { status: "error", message: `Echec de livraison de l'evenement de test${responseClass ? ` (${responseClass})` : ""}.` };
}

export async function sendPartnerWebhookTestEventAction(_previous: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const id = text(formData, "id");
  if (!UUID.test(id)) return { status: "error", message: "Endpoint introuvable." };
  const call = await callApi(`/webhook-endpoints/${id}/test`, "POST", { reason });
  guard(call);
  if (!isOk(call)) return failure(call);
  revalidatePath(PAGE_PATH);
  return testEventState(call.body);
}
