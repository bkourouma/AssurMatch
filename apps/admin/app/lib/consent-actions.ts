"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAdminConsentText,
  publishAdminConsentText,
  retireAdminConsentText,
  type AdminConsentTextData
} from "./admin-api";
import type { CatalogActionState } from "./catalog-actions";
import { adminWriteErrorMessage, CONSENT_CHANNEL_OPTIONS, CONSENT_PURPOSE_OPTIONS } from "./catalog-messages";

/**
 * Spec 050 US3: consent texts. The hash is never sent: the server computes it from the content. A
 * text is always born a draft; publication (422 `CONSENT_TEXT_INVALID` with its failing controls)
 * and retirement are separate, audited acts reserved to compliance.
 */
const REASON_MIN_LENGTH = 8;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function reasonError(reason: string): CatalogActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
}

function pick<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

export async function createConsentTextAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const content = text(formData, "content");
  if (!content) return { status: "error", message: "Le contenu du texte est obligatoire : c'est lui qui sera montré au visiteur et dont l'empreinte est calculée." };
  const productId = text(formData, "productId");
  const result = await createAdminConsentText({
    purpose: pick(text(formData, "purpose"), CONSENT_PURPOSE_OPTIONS, "lead_transmission") as AdminConsentTextData["purpose"],
    countryId: text(formData, "countryId"),
    ...(productId ? { productId } : {}),
    channel: pick(text(formData, "channel"), CONSENT_CHANNEL_OPTIONS, "public_web") as AdminConsentTextData["channel"],
    recipientCategory: text(formData, "recipientCategory"),
    language: text(formData, "language") || "fr",
    version: text(formData, "version"),
    content,
    reason
  });
  if (!result.ok || !result.data) {
    return {
      status: "error",
      message: adminWriteErrorMessage(result),
      ...(result.blockers.length > 0 ? { blockers: result.blockers } : {})
    };
  }
  revalidatePath("/consent-texts");
  redirect(`/consent-texts/${encodeURIComponent(result.data.id)}?notice=created`);
}

async function lifecycle(
  formData: FormData,
  run: (id: string, reason: string) => ReturnType<typeof publishAdminConsentText>,
  successMessage: string
): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const consentTextId = text(formData, "consentTextId");
  const result = await run(consentTextId, reason);
  if (!result.ok) {
    return {
      status: "error",
      message: adminWriteErrorMessage(result),
      ...(result.blockers.length > 0 ? { blockers: result.blockers } : {})
    };
  }
  revalidatePath("/consent-texts");
  revalidatePath(`/consent-texts/${consentTextId}`);
  revalidatePath("/quote-form-definitions");
  revalidatePath("/activation-checklist");
  return { status: "success", message: successMessage };
}

export async function publishConsentTextAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  return lifecycle(
    formData,
    publishAdminConsentText,
    "Texte publié. Il devient immuable ; les formulaires liés à une version précédente sont signalés « consentement remplacé »."
  );
}

export async function retireConsentTextAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  return lifecycle(formData, retireAdminConsentText, "Texte retiré. Il ne peut plus être lié à un nouveau formulaire.");
}
