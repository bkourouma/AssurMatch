"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  authorizeAdminPartnerCountry,
  authorizeAdminPartnerProduct,
  changeAdminPartnerStatus,
  convertAdminPartnerApplication,
  createAdminPartner,
  createAdminPartnerLicense,
  inviteAdminPartnerUser,
  recordAdminPartnerContract,
  rejectAdminPartnerApplication,
  renewAdminPartnerLicense,
  reviewAdminPartnerApplication,
  reviewAdminPartnerDocument,
  runAdminPartnerLicenseAction,
  updateAdminPartner,
  withdrawAdminPartnerCountry,
  withdrawAdminPartnerProduct,
  type AdminPartnerWriteInput,
  type AdminWriteBlocker,
  type AdminWriteResult,
  type PartnerCapacityStatus,
  type PartnerPlan,
  type PartnerStatus,
  type PartnerUserRole
} from "./admin-api";
import { adminWriteErrorMessage } from "./catalog-messages";
import {
  PARTNER_CAPACITY_OPTIONS,
  PARTNER_PLAN_OPTIONS,
  PARTNER_USER_ROLE_OPTIONS,
  REJECTION_REASON_OPTIONS,
  partnerStatusLabel
} from "./partner-messages";

/**
 * Spec 051 US7: partner page and application actions. Every mutation carries the audited reason
 * ("Motif (audite)", 8 characters minimum); refusals come back as French messages and, for a 422
 * `PARTNER_ACTIVATION_BLOCKED`, with the failing activation conditions.
 */
export interface PartnerActionState {
  status: "idle" | "success" | "error";
  message?: string;
  blockers?: AdminWriteBlocker[];
  /** One-shot activation token when no e-mail could be sent (invitation). */
  token?: string;
  expiresAt?: string;
}

const REASON_MIN_LENGTH = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = text(formData, name);
  return value ? value : undefined;
}

function optionalInt(formData: FormData, name: string): number | undefined {
  const raw = text(formData, name);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) ? value : undefined;
}

function listValue(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => (typeof value === "string" ? value.split(/[,\n]/) : []))
    .map((value) => value.trim())
    .filter(Boolean);
}

function reasonError(reason: string): PartnerActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
}

function idError(...ids: string[]): PartnerActionState | undefined {
  return ids.every((id) => UUID.test(id)) ? undefined : { status: "error", message: "Référence invalide : rechargez la page." };
}

function partnerPaths(partnerId: string): string[] {
  return ["/partners", `/partners/${partnerId}`, "/activation-checklist"];
}

function toState<T>(result: AdminWriteResult<T>, successMessage: string, paths: string[]): PartnerActionState {
  if (result.ok) {
    for (const path of paths) revalidatePath(path);
    return { status: "success", message: successMessage };
  }
  return {
    status: "error",
    message: adminWriteErrorMessage(result),
    ...(result.blockers.length > 0 ? { blockers: result.blockers } : {})
  };
}

/** Identity fields shared by the creation and the edit form. Empty inputs are left out of the patch. */
function partnerFields(formData: FormData): AdminPartnerWriteInput {
  const fields: AdminPartnerWriteInput = {};
  const textKeys = [
    "legalName",
    "tradeName",
    "countryId",
    "city",
    "registrationNumber",
    "primaryEmail",
    "primaryWhatsApp",
    "adminContactName",
    "adminContactEmail",
    "adminContactPhone",
    "commercialContactName",
    "commercialContactEmail",
    "commercialContactPhone"
  ] as const;
  for (const key of textKeys) {
    const value = optionalText(formData, key);
    if (value) fields[key] = value;
  }
  if (formData.has("partnerInsurers")) fields.partnerInsurers = listValue(formData, "partnerInsurers");
  const plan = optionalText(formData, "plan");
  if (plan && (PARTNER_PLAN_OPTIONS as readonly string[]).includes(plan)) fields.plan = plan as PartnerPlan;
  const capacity = optionalText(formData, "capacityStatus");
  if (capacity && (PARTNER_CAPACITY_OPTIONS as readonly string[]).includes(capacity)) fields.capacityStatus = capacity as PartnerCapacityStatus;
  const quota = optionalInt(formData, "quotaMonthlyLeads");
  if (quota !== undefined) fields.quotaMonthlyLeads = quota;
  const sla = optionalInt(formData, "slaTargetMinutes");
  if (sla !== undefined) fields.slaTargetMinutes = sla;
  return fields;
}

export async function createPartnerAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const result = await createAdminPartner({ ...partnerFields(formData), reason });
  if (result.ok && result.data?.id) {
    revalidatePath("/partners");
    redirect(`/partners/${encodeURIComponent(result.data.id)}?notice=created`);
  }
  return toState(result, "Courtier créé en Prospect.", ["/partners"]);
}

export async function updatePartnerAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const badId = idError(partnerId);
  if (badId) return badId;
  const expectedUpdatedAt = optionalText(formData, "expectedUpdatedAt");
  const result = await updateAdminPartner(partnerId, { ...partnerFields(formData), ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}), reason });
  return toState(result, "Fiche courtier enregistrée.", partnerPaths(partnerId));
}

export async function changePartnerStatusAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const badId = idError(partnerId);
  if (badId) return badId;
  const status = text(formData, "status") as PartnerStatus;
  const result = await changeAdminPartnerStatus(partnerId, { status, reason });
  return toState(result, `Statut du courtier passé à « ${partnerStatusLabel(status)} ».`, partnerPaths(partnerId));
}

function licenseFields(formData: FormData) {
  return {
    licenseNumber: text(formData, "licenseNumber"),
    issuingAuthority: text(formData, "issuingAuthority"),
    productIds: listValue(formData, "productIds").filter((id) => UUID.test(id)),
    effectiveDate: text(formData, "effectiveDate"),
    expirationDate: text(formData, "expirationDate"),
    reason: text(formData, "reason")
  };
}

export async function createPartnerLicenseAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const fields = licenseFields(formData);
  const invalid = reasonError(fields.reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const countryId = text(formData, "countryId");
  const badId = idError(partnerId, countryId);
  if (badId) return badId;
  const result = await createAdminPartnerLicense(partnerId, { ...fields, countryId });
  return toState(result, "Licence enregistrée en brouillon. Rattachez la preuve d'agrément puis faites-la valider par la conformité.", partnerPaths(partnerId));
}

export async function renewPartnerLicenseAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const fields = licenseFields(formData);
  const invalid = reasonError(fields.reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const licenseId = text(formData, "licenseId");
  const badId = idError(partnerId, licenseId);
  if (badId) return badId;
  const result = await renewAdminPartnerLicense(partnerId, licenseId, fields);
  return toState(result, "Renouvellement enregistré en brouillon. L'ancienne licence sera remplacée à la validation de la nouvelle.", partnerPaths(partnerId));
}

const LICENSE_ACTION_MESSAGES = {
  validate: "Licence validée par la conformité.",
  suspend: "Licence suspendue : le courtier n'est plus éligible sur son périmètre.",
  revoke: "Licence révoquée."
} as const;

export async function partnerLicenseAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const licenseId = text(formData, "licenseId");
  const badId = idError(partnerId, licenseId);
  if (badId) return badId;
  const action = text(formData, "action");
  if (action !== "validate" && action !== "suspend" && action !== "revoke") return { status: "error", message: "Action de licence inconnue." };
  const result = await runAdminPartnerLicenseAction(partnerId, licenseId, action, reason);
  return toState(result, LICENSE_ACTION_MESSAGES[action], partnerPaths(partnerId));
}

export async function reviewPartnerDocumentAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const documentId = text(formData, "documentId");
  const badId = idError(partnerId, documentId);
  if (badId) return badId;
  const decision = text(formData, "decision");
  if (decision !== "accepted" && decision !== "rejected") return { status: "error", message: "Décision inconnue." };
  const result = await reviewAdminPartnerDocument(partnerId, documentId, { decision, reason });
  return toState(result, decision === "accepted" ? "Document accepté par la conformité." : "Document refusé.", partnerPaths(partnerId));
}

export async function recordPartnerContractAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const documentId = text(formData, "documentId");
  const badId = idError(partnerId, documentId);
  if (badId) return { status: "error", message: "Choisissez le document du contrat signé." };
  const result = await recordAdminPartnerContract(partnerId, {
    version: text(formData, "version"),
    signedAt: text(formData, "signedAt"),
    signatoryName: text(formData, "signatoryName"),
    documentId,
    reason
  });
  return toState(result, "Contrat de partenariat enregistré.", partnerPaths(partnerId));
}

export async function authorizePartnerScopeAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const scope = text(formData, "scope");
  const scopeId = text(formData, "scopeId");
  const badId = idError(partnerId, scopeId);
  if (badId) return { status: "error", message: "Choisissez un pays ou un produit." };
  if (scope === "country") {
    return toState(await authorizeAdminPartnerCountry(partnerId, { countryId: scopeId, reason }), "Pays autorisé.", partnerPaths(partnerId));
  }
  if (scope === "product") {
    return toState(await authorizeAdminPartnerProduct(partnerId, { productId: scopeId, reason }), "Produit autorisé.", partnerPaths(partnerId));
  }
  return { status: "error", message: "Périmètre inconnu." };
}

export async function withdrawPartnerScopeAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const scope = text(formData, "scope");
  const scopeId = text(formData, "scopeId");
  const badId = idError(partnerId, scopeId);
  if (badId) return badId;
  if (scope === "country") {
    return toState(await withdrawAdminPartnerCountry(partnerId, scopeId, reason), "Autorisation pays retirée.", partnerPaths(partnerId));
  }
  if (scope === "product") {
    return toState(await withdrawAdminPartnerProduct(partnerId, scopeId, reason), "Autorisation produit retirée.", partnerPaths(partnerId));
  }
  return { status: "error", message: "Périmètre inconnu." };
}

export async function invitePartnerUserAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const partnerId = text(formData, "partnerId");
  const badId = idError(partnerId);
  if (badId) return badId;
  const role = text(formData, "role");
  if (!(PARTNER_USER_ROLE_OPTIONS as readonly string[]).includes(role)) return { status: "error", message: "Choisissez un rôle courtier." };
  const result = await inviteAdminPartnerUser(partnerId, {
    email: text(formData, "email"),
    displayName: text(formData, "displayName"),
    role: role as PartnerUserRole,
    reason
  });
  if (!result.ok || !result.data) return toState(result, "", []);
  for (const path of partnerPaths(partnerId)) revalidatePath(path);
  revalidatePath("/users");
  const delivery = result.data.emailStatus === "sent"
    ? "E-mail d'activation envoyé."
    : "E-mail d'activation non envoyé : transmettez le jeton ci-dessous par un canal interne sécurisé.";
  return {
    status: "success",
    message: `Utilisateur ${result.data.user.email} invité. ${delivery}`,
    ...(result.data.token ? { token: result.data.token } : {}),
    expiresAt: result.data.expiresAt
  };
}

/* ----------------------------------------------------------------------------- applications */

function applicationPaths(applicationId: string): string[] {
  return ["/partners/applications", `/partners/applications/${applicationId}`];
}

export async function reviewApplicationAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const applicationId = text(formData, "applicationId");
  const badId = idError(applicationId);
  if (badId) return badId;
  return toState(await reviewAdminPartnerApplication(applicationId, reason), "Candidature passée en examen.", applicationPaths(applicationId));
}

/** Compliance only. A conversion creates a Prospect partner and a draft licence, then opens the partner page. */
export async function convertApplicationAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const applicationId = text(formData, "applicationId");
  const badId = idError(applicationId);
  if (badId) return badId;
  const result = await convertAdminPartnerApplication(applicationId, reason);
  if (result.ok && result.data?.partnerTenantId) {
    for (const path of [...applicationPaths(applicationId), "/partners"]) revalidatePath(path);
    redirect(`/partners/${encodeURIComponent(result.data.partnerTenantId)}?notice=converted`);
  }
  return toState(result, "Candidature convertie.", applicationPaths(applicationId));
}

export async function rejectApplicationAction(_previous: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const applicationId = text(formData, "applicationId");
  const badId = idError(applicationId);
  if (badId) return badId;
  const rejectionReasonCode = text(formData, "rejectionReasonCode");
  if (!(REJECTION_REASON_OPTIONS as readonly string[]).includes(rejectionReasonCode)) return { status: "error", message: "Choisissez un motif de refus." };
  const result = await rejectAdminPartnerApplication(applicationId, {
    rejectionReasonCode: rejectionReasonCode as (typeof REJECTION_REASON_OPTIONS)[number],
    reason
  });
  return toState(result, "Candidature refusée. Le candidat reçoit un e-mail neutre, sans la note interne.", applicationPaths(applicationId));
}
