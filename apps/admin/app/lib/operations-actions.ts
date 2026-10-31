"use server";

import { revalidatePath } from "next/cache";
import { decideQuoteReview, reassignLeadAssignment, updateContactMessageStatus, type OperationsWriteResult } from "./operations-api";

/** Spec 056: result of a console action; a refusal is shown with its reason, never thrown. */
export interface OperationsActionState {
  status: "idle" | "success" | "error";
  message?: string | undefined;
}

const REVIEW_DECISIONS = ["route", "assign", "non_routable", "duplicate"] as const;
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
const CONTACT_STATUSES = ["new", "handled", "spam"] as const;
type ContactStatus = (typeof CONTACT_STATUSES)[number];

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function refusal(result: OperationsWriteResult<unknown>): OperationsActionState {
  const reasons: Record<number, string> = {
    0: "API indisponible : réessayez plus tard.",
    400: "Saisie invalide : le motif doit compter au moins 8 caractères.",
    401: "Session expirée : reconnectez-vous.",
    403: "Action refusée pour votre rôle ou hors de votre périmètre pays (refus audité).",
    404: "Élément introuvable (référence ou identifiant inconnu).",
    409: "Conflit : l'élément a déjà été traité ou la cible est identique.",
    422: "Refus de conformité : consentement absent ou retiré, ou courtier partenaire non éligible. Rien n'a été transmis."
  };
  const base = reasons[result.status] ?? `Refus de l'API (${result.status}).`;
  return { status: "error", message: result.message && result.status !== 0 ? `${base} Détail : ${result.message}` : base };
}

export async function decideQuoteReviewAction(_previous: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const quoteRequestId = text(formData.get("quoteRequestId"));
  const decision = REVIEW_DECISIONS.find((value) => value === text(formData.get("decision"))) as ReviewDecision | undefined;
  const reason = text(formData.get("reason"));
  if (!quoteRequestId || !decision) return { status: "error", message: "Décision de revue invalide." };
  const partnerTenantId = text(formData.get("partnerTenantId"));
  const duplicateOfReference = text(formData.get("duplicateOfReference"));
  if (decision === "assign" && !partnerTenantId) return { status: "error", message: "Choisissez un courtier partenaire éligible." };
  const result = await decideQuoteReview(quoteRequestId, {
    decision,
    reason,
    ...(decision === "assign" ? { partnerTenantId } : {}),
    ...(decision === "duplicate" && duplicateOfReference ? { duplicateOfReference } : {})
  });
  if (!result.ok || !result.data) return refusal(result);
  revalidatePath("/operations/quote-review");
  revalidatePath("/quote-requests");
  revalidatePath(`/quote-requests/${quoteRequestId}`);
  return { status: "success", message: `Décision enregistrée : statut ${result.data.status}, routage ${result.data.routingStatus}.` };
}

export async function reassignLeadAssignmentAction(_previous: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const assignmentId = text(formData.get("assignmentId"));
  const partnerTenantId = text(formData.get("partnerTenantId"));
  if (!assignmentId || !partnerTenantId) return { status: "error", message: "Affectation et courtier partenaire requis." };
  const result = await reassignLeadAssignment(assignmentId, { partnerTenantId, reason: text(formData.get("reason")) });
  if (!result.ok || !result.data) return refusal(result);
  revalidatePath("/lead-assignments");
  return { status: "success", message: `Lead réaffecté (statut ${result.data.status}). L'ancien courtier perd l'accès.` };
}

export async function updateContactMessageStatusAction(_previous: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const messageId = text(formData.get("messageId"));
  const status = CONTACT_STATUSES.find((value) => value === text(formData.get("status"))) as ContactStatus | undefined;
  if (!messageId || !status) return { status: "error", message: "Statut de message invalide." };
  const reason = text(formData.get("reason"));
  const result = await updateContactMessageStatus(messageId, { status, ...(reason ? { reason } : {}) });
  if (!result.ok || !result.data) return refusal(result);
  revalidatePath("/operations/contact-messages");
  return { status: "success", message: `Message ${result.data.publicReference} : ${result.data.previousStatus} -> ${result.data.status}.` };
}
