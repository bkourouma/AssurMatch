"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { writeSelfService, type SelfServiceWriteResult } from "./self-service-api";
import { selfServiceErrorMessage } from "./self-service-messages";

/**
 * Spec 053: broker self-service server actions. The API re-checks the role (owner and managers
 * write), the partner of the session, the suspended-partner guard and every business rule; refusals
 * come back as French messages.
 */
export interface SelfServiceActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN_LENGTH = 8;
const JUSTIFICATION_MIN_LENGTH = 10;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refused<T>(result: SelfServiceWriteResult<T>, returnTo: string): SelfServiceActionState {
  if (result.status === 401) redirect(loginRedirect(returnTo, "session_expired"));
  return { status: "error", message: selfServiceErrorMessage(result) };
}

/* ------------------------------------------------------------------- company profile (G-01) */

const PROFILE_FIELDS = [
  "primaryEmail",
  "primaryWhatsApp",
  "city",
  "adminContactName",
  "adminContactEmail",
  "adminContactPhone",
  "commercialContactName",
  "commercialContactEmail",
  "commercialContactPhone"
] as const;

/** FR-002: contacts and commercial presentation; an empty field keeps the current value. */
export async function updateCompanyProfileAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const body: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    const value = text(formData, field);
    if (value) body[field] = value;
  }
  const insurers = text(formData, "partnerInsurers");
  if (formData.has("partnerInsurers")) body.partnerInsurers = insurers.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");
  if (expectedUpdatedAt) body.expectedUpdatedAt = expectedUpdatedAt;
  const reason = text(formData, "reason");
  if (reason) body.reason = reason;
  const result = await writeSelfService("/broker/account/profile", "PATCH", body);
  if (!result.ok) return refused(result, "/company");
  revalidatePath("/company");
  return { status: "success", message: "Profil mis à jour. La modification est tracée dans le journal d'audit." };
}

/** FR-003: identity fields go to AssurMatch as a request; only filled fields are requested. */
export async function requestIdentityChangeAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const body: Record<string, unknown> = {};
  for (const field of ["legalName", "tradeName", "registrationNumber", "countryId"] as const) {
    const value = text(formData, field);
    if (value) body[field] = value;
  }
  if (Object.keys(body).length === 0) return { status: "error", message: "Renseignez au moins un champ à modifier." };
  if (body.countryId && !UUID.test(String(body.countryId))) return { status: "error", message: "Pays invalide." };
  const justification = text(formData, "justification");
  if (justification.length < JUSTIFICATION_MIN_LENGTH) return { status: "error", message: `Justification obligatoire : au moins ${JUSTIFICATION_MIN_LENGTH} caractères.` };
  const result = await writeSelfService("/broker/account/requests/profile", "POST", { ...body, justification });
  if (!result.ok) return refused(result, "/company");
  revalidatePath("/company");
  return { status: "success", message: "Demande transmise : AssurMatch l'examine. Les valeurs actuelles restent en vigueur jusqu'à sa décision." };
}

/** FR-013: one country or one product, chosen as `country:<id>` or `product:<id>`. */
export async function requestCoverageExtensionAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const [kind = "", id = ""] = text(formData, "scope").split(":");
  if ((kind !== "country" && kind !== "product") || !UUID.test(id)) return { status: "error", message: "Choisissez un pays ou un produit." };
  const justification = text(formData, "justification");
  if (justification.length < JUSTIFICATION_MIN_LENGTH) return { status: "error", message: `Justification obligatoire : au moins ${JUSTIFICATION_MIN_LENGTH} caractères.` };
  const result = await writeSelfService("/broker/account/requests/coverage", "POST", { [kind === "country" ? "countryId" : "productId"]: id, justification });
  if (!result.ok) return refused(result, "/company");
  revalidatePath("/company");
  return { status: "success", message: "Demande d'extension transmise à AssurMatch. Une extension pays exige une licence pour ce pays." };
}

export async function cancelRequestAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const requestId = text(formData, "requestId");
  if (!UUID.test(requestId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const reason = text(formData, "reason");
  const result = await writeSelfService(`/broker/account/requests/${encodeURIComponent(requestId)}/cancel`, "POST", reason ? { reason } : {});
  if (!result.ok) return refused(result, "/company");
  revalidatePath("/company");
  return { status: "success", message: "Demande annulée." };
}

/* -------------------------------------------------------------------------- licences (G-02) */

/** FR-006: a renewal draft (same country as the renewed licence); the proof follows. */
export async function renewLicenseAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const licenseId = text(formData, "licenseId");
  if (!UUID.test(licenseId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const licenseNumber = text(formData, "licenseNumber");
  const issuingAuthority = text(formData, "issuingAuthority");
  const effectiveDate = text(formData, "effectiveDate");
  const expirationDate = text(formData, "expirationDate");
  if (!licenseNumber || !issuingAuthority) return { status: "error", message: "Renseignez le numéro et l'autorité de délivrance." };
  if (!effectiveDate || !expirationDate) return { status: "error", message: "Renseignez les dates d'effet et d'expiration." };
  if (expirationDate < effectiveDate) return { status: "error", message: "Dates incohérentes : l'expiration doit suivre la date d'effet." };
  const productIds = formData.getAll("productIds").filter((value): value is string => typeof value === "string" && UUID.test(value));
  const reason = text(formData, "reason");
  const result = await writeSelfService(`/broker/licenses/${encodeURIComponent(licenseId)}/renewals`, "POST", {
    licenseNumber,
    issuingAuthority,
    productIds,
    effectiveDate,
    expirationDate,
    ...(reason ? { reason } : {})
  });
  if (!result.ok) return refused(result, "/licenses");
  revalidatePath("/licenses");
  return { status: "success", message: "Renouvellement enregistré en brouillon. Déposez maintenant la preuve : il passera en revue par la conformité." };
}

/* ------------------------------------------------------------------------------ team (G-03) */

export async function inviteTeamMemberAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const email = text(formData, "email");
  const displayName = text(formData, "displayName");
  const role = text(formData, "role");
  if (!email || !displayName) return { status: "error", message: "Renseignez le nom et l'e-mail du collaborateur." };
  if (!["broker_manager", "broker_agent", "broker_read_only"].includes(role)) return { status: "error", message: "Choisissez un rôle." };
  const reason = text(formData, "reason");
  const result = await writeSelfService<{ emailStatus: string }>("/broker/team", "POST", { email, displayName, role, ...(reason ? { reason } : {}) });
  if (!result.ok) return refused(result, "/team");
  revalidatePath("/team");
  const sent = result.data?.emailStatus === "sent";
  return {
    status: "success",
    message: sent
      ? "Invitation envoyée : le collaborateur active son compte depuis l'e-mail reçu et enrôle sa MFA à la première connexion."
      : "Collaborateur créé. L'e-mail d'activation n'a pas pu partir : contactez AssurMatch pour le renvoyer."
  };
}

export async function teamMemberAction(_previous: SelfServiceActionState, formData: FormData): Promise<SelfServiceActionState> {
  const userId = text(formData, "userId");
  const action = text(formData, "action");
  if (!UUID.test(userId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const reason = text(formData, "reason");
  if (reason.length < REASON_MIN_LENGTH) return { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
  let result: SelfServiceWriteResult<unknown>;
  if (action === "deactivate" || action === "reactivate") {
    result = await writeSelfService(`/broker/team/${encodeURIComponent(userId)}/${action}`, "POST", { reason });
  } else if (action === "role") {
    const role = text(formData, "role");
    if (!["broker_manager", "broker_agent", "broker_read_only"].includes(role)) return { status: "error", message: "Choisissez un rôle." };
    result = await writeSelfService(`/broker/team/${encodeURIComponent(userId)}/role`, "PATCH", { role, reason });
  } else {
    return { status: "error", message: "Action inconnue." };
  }
  if (!result.ok) return refused(result, "/team");
  revalidatePath("/team");
  return {
    status: "success",
    message: action === "deactivate"
      ? "Collaborateur désactivé : son accès est coupé dès sa prochaine requête."
      : action === "reactivate"
        ? "Collaborateur réactivé."
        : "Rôle modifié : le collaborateur doit se reconnecter pour l'appliquer."
  };
}
