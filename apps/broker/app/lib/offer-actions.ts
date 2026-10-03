"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginRedirect } from "./backoffice-auth";
import { offerPath, writeBrokerOffer, type BrokerOfferWriteResult, type OfferBlocker } from "./offer-api";
import { dateInputToIso, offerContentFromForm, offerWriteErrorMessage } from "./offer-messages";

/**
 * Spec 052 US1/US3: broker offer actions (owner and managers only; the API re-checks role,
 * ownership, licensed coverage and the suspended-partner guard). Refusals come back as French
 * messages with the `{ code, field }` blockers of a 422.
 */
export interface BrokerOfferActionState {
  status: "idle" | "success" | "error";
  message?: string;
  blockers?: OfferBlocker[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN_LENGTH = 8;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refused<T>(result: BrokerOfferWriteResult<T>, returnTo: string): BrokerOfferActionState {
  if (result.status === 401) redirect(loginRedirect(returnTo, "session_expired"));
  return {
    status: "error",
    message: offerWriteErrorMessage(result),
    ...(result.blockers.length ? { blockers: result.blockers } : {})
  };
}

function revalidateOffer(offerId?: string): void {
  revalidatePath("/offers");
  if (offerId) revalidatePath(`/offers/${offerId}`);
}

function contentOrError(formData: FormData) {
  const content = offerContentFromForm(formData);
  if (!content.name) return { error: { status: "error", message: "Le nom commercial est obligatoire." } as BrokerOfferActionState };
  if (!content.validFrom || !content.validUntil) {
    return { error: { status: "error", message: "Renseignez les dates de début et de fin de validité." } as BrokerOfferActionState };
  }
  return { content };
}

/** US1: creates version 1 in draft, on a country x product the broker is licensed for. */
export async function createBrokerOfferAction(_previous: BrokerOfferActionState, formData: FormData): Promise<BrokerOfferActionState> {
  const [countryId = "", productId = ""] = text(formData, "scope").split(":");
  if (!UUID.test(countryId) || !UUID.test(productId)) return { status: "error", message: "Choisissez un pays et un produit." };
  const parsed = contentOrError(formData);
  if (parsed.error) return parsed.error;
  const result = await writeBrokerOffer("/broker/offers", "POST", { ...parsed.content, countryId, productId });
  if (!result.ok || !result.data) return refused(result, "/offers/new");
  revalidateOffer();
  redirect(`/offers/${encodeURIComponent(result.data.id)}?notice=created`);
}

/** US3: edits the version in progress, or creates version N+1 from the published one. */
export async function updateBrokerOfferAction(_previous: BrokerOfferActionState, formData: FormData): Promise<BrokerOfferActionState> {
  const offerId = text(formData, "offerId");
  if (!UUID.test(offerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const parsed = contentOrError(formData);
  if (parsed.error) return parsed.error;
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");
  const reason = text(formData, "reason");
  const result = await writeBrokerOffer(offerPath(offerId), "PATCH", {
    ...parsed.content,
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    ...(reason ? { reason } : {})
  });
  if (!result.ok) return refused(result, `/offers/${offerId}`);
  revalidateOffer(offerId);
  return { status: "success", message: "Version enregistrée en brouillon. Soumettez-la quand elle est complète ; la version publiée reste en ligne d'ici là." };
}

export async function submitBrokerOfferAction(_previous: BrokerOfferActionState, formData: FormData): Promise<BrokerOfferActionState> {
  const offerId = text(formData, "offerId");
  if (!UUID.test(offerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const reason = text(formData, "reason");
  const result = await writeBrokerOffer(offerPath(offerId, "/submit"), "POST", reason ? { reason } : {});
  if (!result.ok) return refused(result, `/offers/${offerId}`);
  revalidateOffer(offerId);
  return { status: "success", message: "Version soumise : elle est en attente de validation par AssurMatch." };
}

/** `pending` abandons the version in progress; `offer` withdraws the offer from the public. */
export async function withdrawBrokerOfferAction(_previous: BrokerOfferActionState, formData: FormData): Promise<BrokerOfferActionState> {
  const offerId = text(formData, "offerId");
  if (!UUID.test(offerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const target = text(formData, "target");
  if (target !== "pending" && target !== "offer") return { status: "error", message: "Action inconnue." };
  const reason = text(formData, "reason");
  if (reason.length < REASON_MIN_LENGTH) return { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
  const result = await writeBrokerOffer(offerPath(offerId, "/withdraw"), "POST", { reason, target });
  if (!result.ok) return refused(result, `/offers/${offerId}`);
  revalidateOffer(offerId);
  return {
    status: "success",
    message: target === "offer" ? "Offre retirée du public. Son historique est conservé." : "Version en cours abandonnée. La version publiée, s'il y en a une, reste en ligne."
  };
}

/** US5 scenario 3: renewal creates a new version with new dates, to submit like any version. */
export async function renewBrokerOfferAction(_previous: BrokerOfferActionState, formData: FormData): Promise<BrokerOfferActionState> {
  const offerId = text(formData, "offerId");
  if (!UUID.test(offerId)) return { status: "error", message: "Référence invalide : rechargez la page." };
  const validFrom = dateInputToIso(text(formData, "validFrom"));
  const validUntil = dateInputToIso(text(formData, "validUntil"), true);
  if (!validFrom || !validUntil) return { status: "error", message: "Renseignez les nouvelles dates de début et de fin de validité." };
  if (validUntil <= validFrom) return { status: "error", message: "Dates incohérentes : la fin doit être postérieure au début." };
  const reason = text(formData, "reason");
  const result = await writeBrokerOffer(offerPath(offerId, "/renew"), "POST", { validFrom, validUntil, ...(reason ? { reason } : {}) });
  if (!result.ok) return refused(result, `/offers/${offerId}`);
  revalidateOffer(offerId);
  return { status: "success", message: "Nouvelle version créée avec les nouvelles dates. Soumettez-la à la validation." };
}
