"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const FLAGS_PATH = "/ai-assistance/flags";
const REASON_MIN_LENGTH = 8;
const REASON_MAX_LENGTH = 500;

const COUNTRY_KEYS = new Set(["country_ai_enabled"]);
const PRODUCT_KEYS = new Set(["product_ai_scoring_enabled", "product_ai_form_assistant_enabled"]);

export interface AiScopeFlagActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function failure(message: string): AiScopeFlagActionState {
  return { status: "error", message };
}

function refusalMessage(code: string | undefined): string {
  if (code === "SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION") {
    return "Produit hautement sensible : activation IA refusee sans exception documentee.";
  }
  if (code === "ACTIVATION_VIA_OPS_ONLY") {
    return "Activation impossible depuis cet ecran : elle passe par la commande d'exploitation npm run ops:apply-flag-policy.";
  }
  return "Changement refuse par les regles de conformite : verifiez le motif et vos droits.";
}

/** Reads the API error code (reason, code, or the code prefixing the message: the HTTP error filter keeps only its own codes), compared case-insensitively. */
async function readRefusalCode(response: Response): Promise<string | undefined> {
  const known = ["SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION", "ACTIVATION_VIA_OPS_ONLY"];
  try {
    const body = await response.json() as { reason?: unknown; code?: unknown; message?: unknown; response?: { code?: unknown } };
    const candidates = [body.reason, body.code, body.message, body.response?.code];
    return known.find((code) => candidates.some((entry) => typeof entry === "string" && entry.toUpperCase().includes(code)));
  } catch {
    return undefined;
  }
}

/**
 * Spec 074 FR-001/FR-006: changes one AI flag of one country or product through the dedicated route.
 * This screen can only DISABLE a flag (reason required): activation goes through the operations
 * command, and the API refuses it with ACTIVATION_VIA_OPS_ONLY. The authorisation (role, MFA,
 * scope) is decided by the API; no global flag is touched here.
 */
export async function applyAiScopeFlagAction(_previous: AiScopeFlagActionState, formData: FormData): Promise<AiScopeFlagActionState> {
  const scopeType = text(formData, "scopeType");
  const scopeId = text(formData, "scopeId");
  const key = text(formData, "key");
  const value = text(formData, "value") === "true";
  const reason = text(formData, "reason");

  const validKey = scopeType === "country" ? COUNTRY_KEYS.has(key) : scopeType === "product" ? PRODUCT_KEYS.has(key) : false;
  if (!validKey || scopeId.length === 0) return failure("Demande invalide : portee ou flag inconnu.");
  if (reason.length < REASON_MIN_LENGTH || reason.length > REASON_MAX_LENGTH) {
    return failure(`Motif obligatoire : entre ${REASON_MIN_LENGTH} et ${REASON_MAX_LENGTH} caracteres, conserve dans l'audit.`);
  }
  if (value) return failure(refusalMessage("ACTIVATION_VIA_OPS_ONLY"));

  const token = await getBackOfficeToken();
  if (!token) redirect(loginRedirect(FLAGS_PATH, "session_required"));

  let response: Response;
  try {
    response = await fetch(`${backOfficeApiBaseUrl()}/admin/ai/scope-flags`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scopeType, scopeId, key, value, reason }),
      cache: "no-store"
    });
  } catch {
    return failure("Service indisponible : le changement n'a pas ete applique. Reessayez plus tard.");
  }

  if (response.status === 401) redirect(loginRedirect(FLAGS_PATH, "session_expired"));
  if (response.status === 403) {
    const code = await readRefusalCode(response);
    if (code) return failure(refusalMessage(code));
    return failure("Action refusee : role (super admin, conformite ou AI Admin), MFA ou portee insuffisants.");
  }
  if (response.status === 422) return failure(refusalMessage(await readRefusalCode(response)));
  if (!response.ok) return failure("Changement non applique : erreur inattendue du service. Reessayez plus tard.");

  revalidatePath(FLAGS_PATH);
  return { status: "success", message: "Flag IA desactive et audite." };
}
