"use server";

import { revalidatePath } from "next/cache";
import {
  changeAdminCountryStatus,
  createAdminCountry,
  createAdminCountryLink,
  createAdminProduct,
  createRegulatoryRegime,
  retireAdminCountryLink,
  retireRegulatoryRegime,
  toggleAdminCountryFlag,
  toggleAdminCountryLinkFlag,
  toggleAdminProductFlag,
  updateAdminCountry,
  updateAdminFeatureFlag,
  updateAdminProduct,
  updateRegulatoryRegime,
  type AdminCountryWriteInput,
  type AdminProductWriteInput,
  type AdminWriteBlocker,
  type AdminWriteResult,
  type RegulatoryRegimeWriteInput
} from "./admin-api";
import { adminWriteErrorMessage, flagLabel, isSensitiveFlagKey, SENSITIVE_FLAG_EXPLANATION } from "./catalog-messages";

/**
 * Spec 050 US1, US2, US6 and the global flag screen. Every mutation carries a reason ("Motif
 * (audite)") of at least 8 characters; refusals come back as French messages and, for 422
 * activation refusals, with the list of failing checklist controls.
 */
export interface CatalogActionState {
  status: "idle" | "success" | "error";
  message?: string;
  blockers?: AdminWriteBlocker[];
}

const REASON_MIN_LENGTH = 8;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = text(formData, name);
  return value ? value : undefined;
}

function checked(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function listValue(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean);
}

function lengthsValue(formData: FormData, name: string): number[] | undefined {
  const values = listValue(formData, name).map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value));
  return values.length > 0 ? values : undefined;
}

function reasonError(reason: string): CatalogActionState | undefined {
  return reason.length >= REASON_MIN_LENGTH
    ? undefined
    : { status: "error", message: `Motif obligatoire : au moins ${REASON_MIN_LENGTH} caractères, conservé dans l'audit.` };
}

function toState<T>(result: AdminWriteResult<T>, successMessage: string, paths: string[]): CatalogActionState {
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

function countryFields(formData: FormData): AdminCountryWriteInput {
  const name = optionalText(formData, "name");
  const currency = optionalText(formData, "currency");
  const timezone = optionalText(formData, "timezone");
  const regulatoryFamily = optionalText(formData, "regulatoryFamily") as AdminCountryWriteInput["regulatoryFamily"] | undefined;
  const regulatoryRegimeId = optionalText(formData, "regulatoryRegimeId");
  const phoneDialCode = optionalText(formData, "phoneDialCode");
  const languages = listValue(formData, "languages");
  const phoneNationalLengths = lengthsValue(formData, "phoneNationalLengths");
  return {
    ...(name ? { name } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(languages.length > 0 ? { languages } : {}),
    ...(timezone ? { timezone } : {}),
    ...(regulatoryFamily ? { regulatoryFamily } : {}),
    ...(regulatoryRegimeId ? { regulatoryRegimeId } : {}),
    ...(phoneDialCode ? { phoneDialCode } : {}),
    ...(phoneNationalLengths ? { phoneNationalLengths } : {})
  };
}

export async function createCountryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const isoCode = text(formData, "isoCode").toUpperCase();
  const result = await createAdminCountry({ ...countryFields(formData), isoCode, reason });
  return toState(result, `Pays ${isoCode} créé en brouillon, tous ses flags fermés. Il n'est pas exposé aux visiteurs.`, ["/catalog/countries", "/catalog"]);
}

export async function updateCountryAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const countryId = text(formData, "countryId");
  const expectedUpdatedAt = optionalText(formData, "expectedUpdatedAt");
  const result = await updateAdminCountry(countryId, { ...countryFields(formData), ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}), reason });
  return toState(result, "Fiche pays enregistrée.", ["/catalog/countries", `/catalog/countries/${countryId}`]);
}

export async function changeCountryStatusAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const countryId = text(formData, "countryId");
  const status = text(formData, "status");
  const result = await changeAdminCountryStatus(countryId, { status, reason });
  return toState(result, `Statut du pays passé à « ${status} ».`, ["/catalog/countries", `/catalog/countries/${countryId}`, "/activation-checklist"]);
}

/**
 * One action for the three flag targets (country, product, country x product link). The form posts
 * the target value explicitly, so a stale page can only repeat the intended change, never invert it.
 */
export async function toggleCatalogFlagAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const target = text(formData, "target");
  const key = text(formData, "key");
  const value = text(formData, "value") === "true";
  const countryId = text(formData, "countryId");
  const productId = text(formData, "productId");
  const input = { key, value, reason };
  const verb = value ? "activé" : "désactivé";
  const message = `${flagLabel(key)} ${verb}.`;
  if (target === "country") {
    return toState(await toggleAdminCountryFlag(countryId, input), message, ["/catalog/countries", `/catalog/countries/${countryId}`, "/activation-checklist"]);
  }
  if (target === "product") {
    return toState(await toggleAdminProductFlag(productId, input), message, ["/catalog/products", `/catalog/products/${productId}`, "/activation-checklist"]);
  }
  if (target === "link") {
    return toState(await toggleAdminCountryLinkFlag(countryId, productId, input), `${message} (liaison pays × produit)`, [`/catalog/countries/${countryId}`, "/activation-checklist"]);
  }
  return { status: "error", message: "Cible de flag inconnue." };
}

export async function createCountryLinkAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const countryId = text(formData, "countryId");
  const productId = text(formData, "productId");
  if (!productId) return { status: "error", message: "Choisissez un produit." };
  const result = await createAdminCountryLink(countryId, { productId, reason });
  return toState(result, "Produit lié au pays en statut interne, tous les flags de la liaison fermés.", [`/catalog/countries/${countryId}`, "/catalog/products"]);
}

export async function retireCountryLinkAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const countryId = text(formData, "countryId");
  const productId = text(formData, "productId");
  const result = await retireAdminCountryLink(countryId, productId, reason);
  return toState(result, "Liaison retirée : le produit n'est plus proposé dans ce pays.", [`/catalog/countries/${countryId}`, "/catalog/products"]);
}

function productFields(formData: FormData, { includeChecks }: { includeChecks: boolean }): AdminProductWriteInput {
  const name = optionalText(formData, "name");
  const description = optionalText(formData, "description");
  const sensitivity = optionalText(formData, "sensitivity") as AdminProductWriteInput["sensitivity"] | undefined;
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(sensitivity ? { sensitivity } : {}),
    ...(includeChecks ? { requiresDocuments: checked(formData, "requiresDocuments"), requiresManualReview: checked(formData, "requiresManualReview") } : {})
  };
}

export async function createProductAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const key = text(formData, "key");
  const name = text(formData, "name");
  const result = await createAdminProduct({ ...productFields(formData, { includeChecks: true }), key, name, reason });
  return toState(result, `Produit ${key} créé en brouillon, tous ses flags fermés.`, ["/catalog/products", "/catalog"]);
}

export async function updateProductAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const productId = text(formData, "productId");
  const expectedUpdatedAt = optionalText(formData, "expectedUpdatedAt");
  const result = await updateAdminProduct(productId, {
    ...productFields(formData, { includeChecks: true }),
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    reason
  });
  return toState(result, "Fiche produit enregistrée.", ["/catalog/products", `/catalog/products/${productId}`]);
}

function regimeFields(formData: FormData): RegulatoryRegimeWriteInput {
  const name = optionalText(formData, "name");
  const description = optionalText(formData, "description");
  const years = Number.parseInt(text(formData, "retentionOverrideYears"), 10);
  const status = optionalText(formData, "status") as RegulatoryRegimeWriteInput["status"] | undefined;
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(Number.isInteger(years) ? { retentionOverrideYears: years } : {}),
    requiresManualActivationReview: checked(formData, "requiresManualActivationReview"),
    ...(status ? { status } : {})
  };
}

export async function createRegimeAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const key = text(formData, "key");
  const name = text(formData, "name");
  const result = await createRegulatoryRegime({ ...regimeFields(formData), key, name, reason });
  return toState(result, `Régime ${key} créé.`, ["/catalog/regimes"]);
}

export async function updateRegimeAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const regimeId = text(formData, "regimeId");
  const expectedUpdatedAt = optionalText(formData, "expectedUpdatedAt");
  const result = await updateRegulatoryRegime(regimeId, { ...regimeFields(formData), ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}), reason });
  return toState(result, "Régime enregistré.", ["/catalog/regimes"]);
}

export async function retireRegimeAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const regimeId = text(formData, "regimeId");
  const result = await retireRegulatoryRegime(regimeId, reason);
  return toState(result, "Régime retiré.", ["/catalog/regimes"]);
}

/**
 * Global, non-sensitive flags only (existing `PATCH /admin/feature-flags/:id`). A sensitive key is
 * refused here before reaching the API, which refuses it as well.
 */
export async function toggleGlobalFeatureFlagAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const reason = text(formData, "reason");
  const invalid = reasonError(reason);
  if (invalid) return invalid;
  const key = text(formData, "key");
  if (isSensitiveFlagKey(key)) return { status: "error", message: SENSITIVE_FLAG_EXPLANATION };
  const flagId = text(formData, "flagId");
  const value = text(formData, "value") === "true";
  const result = await updateAdminFeatureFlag(flagId, { value, reason });
  return toState(result, `${key} ${value ? "activé" : "désactivé"}.`, ["/feature-flags", "/activation-checklist"]);
}
