"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backOfficeApiBaseUrl, getBackOfficeToken, loginRedirect } from "./backoffice-auth";

const FLAGS_PATH = "/ai-assistance/flags";
const REASON_MIN_LENGTH = 8;
const FIELD_MIN_LENGTH = 3;
const FIELD_MAX_LENGTH = 120;
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
  if (code === "sensitive_product_ai_requires_exception") {
    return "Produit hautement sensible : activation IA refusee sans exception documentee.";
  }
  return "Changement refuse par les regles de conformite : verifiez la reference de politique, l'approbateur et le motif.";
}

/**
 * Spec 074 FR-001/FR-006: changes one AI flag of one country or product through the dedicated route.
 * Activation requires a policy reference and an approver; disabling only needs a reason. The
 * authorisation (role, MFA, scope) is decided by the API; no global flag is touched here.
 */
export async function applyAiScopeFlagAction(_previous: AiScopeFlagActionState, formData: FormData): Promise<AiScopeFlagActionState> {
  const scopeType = text(formData, "scopeType");
  const scopeId = text(formData, "scopeId");
  const key = text(formData, "key");
  const value = text(formData, "value") === "true";
  const reason = text(formData, "reason");
  const reference = text(formData, "reference");
  const approvedBy = text(formData, "approvedBy");

  const validKey = scopeType === "country" ? COUNTRY_KEYS.has(key) : scopeType === "product" ? PRODUCT_KEYS.has(key) : false;
  if (!validKey || scopeId.length === 0) return failure("Demande invalide : portee ou flag inconnu.");
  if (reason.length < REASON_MIN_LENGTH || reason.length > REASON_MAX_LENGTH) {
    return failure(`Motif obligatoire : entre ${REASON_MIN_LENGTH} et ${REASON_MAX_LENGTH} caracteres, conserve dans l'audit.`);
  }
  if (value) {
    if (reference.length < FIELD_MIN_LENGTH || reference.length > FIELD_MAX_LENGTH) return failure("Reference de politique obligatoire pour une activation (3 a 120 caracteres).");
    if (approvedBy.length < FIELD_MIN_LENGTH || approvedBy.length > FIELD_MAX_LENGTH) return failure("Approbateur obligatoire pour une activation (3 a 120 caracteres).");
  }

  const token = await getBackOfficeToken();
  if (!token) redirect(loginRedirect(FLAGS_PATH, "session_required"));

  let response: Response;
  try {
    response = await fetch(`${backOfficeApiBaseUrl()}/admin/ai/scope-flags`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scopeType, scopeId, key, value, reason, ...(value ? { reference, approvedBy } : {}) }),
      cache: "no-store"
    });
  } catch {
    return failure("Service indisponible : le changement n'a pas ete applique. Reessayez plus tard.");
  }

  if (response.status === 401) redirect(loginRedirect(FLAGS_PATH, "session_expired"));
  if (response.status === 403) {
    return failure("Action refusee : role (super admin ou conformite pour activer, AI Admin autorise pour desactiver), MFA ou portee insuffisants.");
  }
  if (response.status === 422) {
    let code: string | undefined;
    try {
      const body = await response.json() as { reason?: unknown; code?: unknown; message?: unknown };
      const candidate = [body.reason, body.code, body.message].find((entry) => entry === "sensitive_product_ai_requires_exception");
      code = typeof candidate === "string" ? candidate : undefined;
    } catch {
      code = undefined;
    }
    return failure(refusalMessage(code));
  }
  if (!response.ok) return failure("Changement non applique : erreur inattendue du service. Reessayez plus tard.");

  revalidatePath(FLAGS_PATH);
  return { status: "success", message: value ? "Flag IA active et audite." : "Flag IA desactive et audite." };
}
