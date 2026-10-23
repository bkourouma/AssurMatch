"use server";

import { revalidatePath } from "next/cache";
import type { AdminWriteResult } from "./admin-api";
import {
  ACTIVATION_ATTESTABLE_CONTROLS,
  ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH,
  type ActivationAttestationScopeType
} from "../../../../packages/shared/contracts/activation-checklist.contracts";
import type { AdminProductCategoryUpdateDto } from "../../../../packages/shared/contracts/catalog.contracts";
import type { CatalogActionState } from "./catalog-actions";
import { ATTESTATION_ROLE_MESSAGE, adminWriteErrorMessage } from "./catalog-messages";
import {
  attestActivationControl,
  createAdminProductCategory,
  revokeActivationAttestation,
  updateAdminProductCategory
} from "./lot4-catalog-api";

/**
 * Spec 070 lot 4 server actions: product categories (PROD-001) and activation attestations
 * (PRD 35/36). Same state shape and 8-character audited reason as the other catalogue actions.
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

function toState<T>(result: AdminWriteResult<T>, successMessage: string, paths: string[], messageFor = adminWriteErrorMessage): CatalogActionState {
  if (result.ok) {
    for (const path of paths) revalidatePath(path);
    return { status: "success", message: successMessage };
  }
  return { status: "error", message: messageFor(result) };
}

/* --- Product categories --- */

export async function createProductCategoryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const key = text(formData, "key").toLowerCase();
  const name = text(formData, "name");
  const nameEn = text(formData, "nameEn");
  const description = text(formData, "description");
  const sortOrder = Number.parseInt(text(formData, "sortOrder"), 10);
  const result = await createAdminProductCategory({
    key,
    name,
    ...(nameEn ? { nameEn } : {}),
    ...(description ? { description } : {}),
    ...(Number.isInteger(sortOrder) ? { sortOrder } : {}),
    reason
  });
  return toState(result, `Catégorie ${key} créée en brouillon. Activez-la pour pouvoir la choisir sur un produit.`, ["/catalog/categories", "/catalog/products"]);
}

export async function updateProductCategoryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const categoryId = text(formData, "categoryId");
  const name = text(formData, "name");
  const nameEn = text(formData, "nameEn");
  const description = text(formData, "description");
  const sortOrder = Number.parseInt(text(formData, "sortOrder"), 10);
  const status = text(formData, "status") as NonNullable<AdminProductCategoryUpdateDto["status"]>;
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");
  const result = await updateAdminProductCategory(categoryId, {
    ...(name ? { name } : {}),
    nameEn: nameEn || null,
    description: description || null,
    ...(Number.isInteger(sortOrder) ? { sortOrder } : {}),
    ...(status ? { status } : {}),
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    reason
  });
  return toState(result, "Catégorie enregistrée.", ["/catalog/categories", "/catalog/products"]);
}

/* --- Activation attestations --- */

function attestationErrorMessage(result: Pick<AdminWriteResult<unknown>, "status" | "code" | "message">): string {
  if (result.status === 403) return ATTESTATION_ROLE_MESSAGE;
  if (result.status === 400 || result.status === 422) {
    return `Attestation refusée : ${result.message ?? "vérifiez la note ou le motif saisi."}`;
  }
  if (result.status === 409) return "Cette attestation a déjà été enregistrée ou révoquée. Rechargez la page pour voir l'état à jour.";
  return adminWriteErrorMessage(result);
}

function attestableControl(scopeType: string, controlKey: string): { label: string; minNoteLength: number } | undefined {
  const controls = ACTIVATION_ATTESTABLE_CONTROLS[scopeType as ActivationAttestationScopeType] as Record<string, { label: string; minNoteLength: number }> | undefined;
  return controls?.[controlKey];
}

export async function attestActivationControlAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const scopeType = text(formData, "scopeType");
  const scopeId = text(formData, "scopeId");
  const controlKey = text(formData, "controlKey");
  const note = text(formData, "note");
  const control = attestableControl(scopeType, controlKey);
  if (!control || (scopeType !== "country" && scopeType !== "product") || !scopeId) {
    return { status: "error", message: "Ce contrôle ne s'atteste pas manuellement." };
  }
  if (note.length < control.minNoteLength) {
    return { status: "error", message: `Note trop courte : au moins ${control.minNoteLength} caractères (référence du document ou du lien de preuve, sans donnée personnelle).` };
  }
  if (note.length > ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH) {
    return { status: "error", message: `Note trop longue : ${ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH} caractères au maximum.` };
  }
  const result = await attestActivationControl({ scopeType, scopeId, controlKey, note });
  return toState(result, "Attestation de conformité enregistrée.", ["/activation-checklist"], attestationErrorMessage);
}

export async function revokeActivationAttestationAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const scopeType = text(formData, "scopeType");
  const scopeId = text(formData, "scopeId");
  const controlKey = text(formData, "controlKey");
  if (!attestableControl(scopeType, controlKey) || (scopeType !== "country" && scopeType !== "product") || !scopeId) {
    return { status: "error", message: "Ce contrôle ne s'atteste pas manuellement." };
  }
  const result = await revokeActivationAttestation({ scopeType, scopeId, controlKey, reason });
  return toState(result, "Attestation révoquée : le contrôle redevient bloquant.", ["/activation-checklist"], attestationErrorMessage);
}
