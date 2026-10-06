"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAdminOffer,
  runAdminOfferDecision,
  updateAdminOffer,
  type AdminOfferWriteInput,
  type AdminWriteResult,
  type OfferBlocker,
  type OfferType
} from "./admin-api";
import { offerContentFromForm, offerWriteErrorMessage } from "./offer-messages";

/**
 * Spec 052 US2/US5: admin offer actions. Every mutation carries the audited reason ("Motif
 * (audite)", 8 characters minimum). Refusals come back as French messages and, for a 422, with the
 * `{ code, field }` blockers (missing fields, validation controls, uncovered scope).
 */
export interface OfferActionState {
  status: "idle" | "success" | "error";
  message?: string;
  blockers?: OfferBlocker[];
}

const REASON_MIN_LENGTH = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function reasonError(reason: string): OfferActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
}

function refused<T>(result: AdminWriteResult<T>): OfferActionState {
  return {
    status: "error",
    message: offerWriteErrorMessage(result),
    ...(result.offerBlockers?.length ? { blockers: result.offerBlockers } : {})
  };
}

function revalidateOffer(offerId?: string): void {
  revalidatePath("/offers");
  revalidatePath("/scoring");
  if (offerId) revalidatePath(`/offers/${offerId}`);
}

function writeInput(formData: FormData): AdminOfferWriteInput | OfferActionState {
  const countryId = text(formData, "countryId");
  const productId = text(formData, "productId");
  if (!UUID.test(countryId) || !UUID.test(productId)) return { status: "error", message: "Choisissez un pays et un produit." };
  const partnerTenantId = text(formData, "partnerTenantId");
  if (partnerTenantId && !UUID.test(partnerTenantId)) return { status: "error", message: "Courtier invalide : rechargez la page." };
  const content = offerContentFromForm(formData);
  if (!content.name) return { status: "error", message: "Le nom commercial est obligatoire." };
  if (!content.validFrom || !content.validUntil) return { status: "error", message: "Renseignez les dates de début et de fin de validité." };
  const offerType = text(formData, "offerType");
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");
  return {
    ...content,
    countryId,
    productId,
    reason: text(formData, "reason"),
    ...(partnerTenantId ? { partnerTenantId } : {}),
    ...(offerType === "indicative" || offerType === "partner" ? { offerType: offerType as OfferType } : {}),
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {})
  };
}

function isState(value: AdminOfferWriteInput | OfferActionState): value is OfferActionState {
  return "status" in value;
}

/** Creates version 1 (draft, `authorRole: admin`) for a partner, then opens the offer page. */
export async function createOfferAction(_previous: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const input = writeInput(formData);
  if (isState(input)) return input;
  const result = await createAdminOffer(input);
  if (!result.ok || !result.data) return refused(result);
  revalidateOffer();
  redirect(`/offers/${encodeURIComponent(result.data.id)}?notice=created`);
}

/** FR-014: edits the version in progress or creates version N+1 from the published one. */
export async function updateOfferAction(_previous: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const offerId = text(formData, "offerId");
  if (!UUID.test(offerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const invalid = reasonError(text(formData, "reason"));
  if (invalid) return invalid;
  const input = writeInput(formData);
  if (isState(input)) return input;
  const result = await updateAdminOffer(offerId, input);
  if (!result.ok) return refused(result);
  revalidateOffer(offerId);
  return { status: "success", message: "Version enregistrée en brouillon. La version publiée reste en ligne jusqu'à la validation de la nouvelle." };
}

const DECISION_MESSAGES = {
  submit: "Version soumise à la conformité.",
  validate: "Version validée et publiée. Le courtier est notifié.",
  reject: "Version refusée : elle repasse en brouillon avec le motif, visible du courtier.",
  suspend: "Offre suspendue : retirée du comparateur. Le courtier voit le motif."
} as const;

/** Submit (preparers and compliance), validate, reject and suspend (compliance only, FR-011). */
export async function offerDecisionAction(_previous: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const offerId = text(formData, "offerId");
  const action = text(formData, "action");
  if (!UUID.test(offerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  if (action !== "submit" && action !== "validate" && action !== "reject" && action !== "suspend") {
    return { status: "error", message: "Action inconnue." };
  }
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const result = await runAdminOfferDecision(offerId, action, reason);
  if (!result.ok) return refused(result);
  revalidateOffer(offerId);
  return { status: "success", message: DECISION_MESSAGES[action] };
}
