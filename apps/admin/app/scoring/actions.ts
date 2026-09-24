"use server";

import { revalidatePath } from "next/cache";
import { createScoringRule, suspendAdminOffer, updateScoringRule, validateAdminOffer, type ScoringCriterionKey, type ScoringWeightsData } from "../lib/admin-api";

export interface ScoringActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const scoringCriterionKeys: ScoringCriterionKey[] = ["guaranteeLevel", "price", "deductible", "processingSpeed", "paymentFlexibility", "informationQuality", "userPreferences"];

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  const text = stringValue(value);
  return text ? text : undefined;
}

function weightsValue(formData: FormData): ScoringWeightsData | undefined {
  const entries = scoringCriterionKeys.map((key) => [key, Number.parseInt(stringValue(formData.get(`weight_${key}`)), 10)] as const);
  if (entries.every(([, value]) => Number.isNaN(value))) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, Number.isNaN(value) ? 0 : value])) as ScoringWeightsData;
}

function actionError(error: unknown): ScoringActionState {
  return { status: "error", message: error instanceof Error ? error.message : "action_failed" };
}

export async function createScoringRuleAction(_previous: ScoringActionState, formData: FormData): Promise<ScoringActionState> {
  try {
    const weights = weightsValue(formData);
    if (!weights) return { status: "error", message: "weights_required" };
    const total = scoringCriterionKeys.reduce((sum, key) => sum + weights[key], 0);
    if (total !== 100) return { status: "error", message: `Les poids doivent totaliser 100 (actuellement ${total}).` };
    const countryId = optionalString(formData.get("countryId"));
    const productId = optionalString(formData.get("productId"));
    const description = optionalString(formData.get("description"));
    const rule = await createScoringRule({
      ...(countryId ? { countryId } : {}),
      ...(productId ? { productId } : {}),
      weights,
      ...(description ? { description } : {}),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/scoring");
    return { status: "success", message: `Regle de scoring creee (version ${rule.version}).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateScoringRuleAction(_previous: ScoringActionState, formData: FormData): Promise<ScoringActionState> {
  try {
    const ruleId = stringValue(formData.get("ruleId"));
    if (!ruleId) return { status: "error", message: "rule_required" };
    const weights = weightsValue(formData);
    if (weights) {
      const total = scoringCriterionKeys.reduce((sum, key) => sum + weights[key], 0);
      if (total !== 100) return { status: "error", message: `Les poids doivent totaliser 100 (actuellement ${total}).` };
    }
    const status = stringValue(formData.get("status"));
    const description = optionalString(formData.get("description"));
    const rule = await updateScoringRule(ruleId, {
      ...(weights ? { weights } : {}),
      ...(status === "active" || status === "disabled" ? { status } : {}),
      ...(description ? { description } : {}),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/scoring");
    return { status: "success", message: `Regle mise a jour (version ${rule.version}, ${rule.status}).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function validateOfferAction(_previous: ScoringActionState, formData: FormData): Promise<ScoringActionState> {
  try {
    const decision = stringValue(formData.get("validationStatus"));
    if (decision !== "validated" && decision !== "rejected") return { status: "error", message: "decision_invalid" };
    const offer = await validateAdminOffer(stringValue(formData.get("offerId")), { validationStatus: decision, reason: stringValue(formData.get("reason")) });
    revalidatePath("/scoring");
    revalidatePath("/offers");
    return { status: "success", message: `Offre ${offer.name}: ${offer.validationStatus} (${offer.status}).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function suspendOfferAction(_previous: ScoringActionState, formData: FormData): Promise<ScoringActionState> {
  try {
    const offer = await suspendAdminOffer(stringValue(formData.get("offerId")), stringValue(formData.get("reason")));
    revalidatePath("/scoring");
    revalidatePath("/offers");
    return { status: "success", message: `Offre ${offer.name} suspendue: retiree du comparateur public.` };
  } catch (error) {
    return actionError(error);
  }
}
