"use server";

import { revalidatePath } from "next/cache";
import { assignPendingQuote, createRoutingRule, reassignLead, updateRoutingRule, type RoutingRuleMode } from "../lib/admin-api";

export interface RoutingActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const modes: RoutingRuleMode[] = ["first_eligible", "round_robin", "priority", "capacity", "performance", "exclusive", "manual"];

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  const text = stringValue(value);
  return text ? text : undefined;
}

function modeValue(value: FormDataEntryValue | null): RoutingRuleMode | undefined {
  const text = stringValue(value);
  return modes.find((mode) => mode === text);
}

/** Priorities are typed as `partnerTenantId:priority` entries separated by commas or new lines. */
function prioritiesValue(value: FormDataEntryValue | null): Array<{ partnerTenantId: string; priority: number }> {
  return stringValue(value)
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [partnerTenantId = "", priority = ""] = entry.split(":").map((part) => part.trim());
      const parsedPriority = Number.parseInt(priority, 10);
      return { partnerTenantId, priority: Number.isInteger(parsedPriority) && parsedPriority > 0 ? parsedPriority : index + 1 };
    });
}

function actionError(error: unknown): RoutingActionState {
  return { status: "error", message: error instanceof Error ? error.message : "action_failed" };
}

/** Spec 042: recipient cap for `multi_send`; anything outside 2-5 is left to the server default. */
function maxRecipientsValue(value: FormDataEntryValue | null): number | undefined {
  const parsed = Number(typeof value === "string" ? value : "");
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 5 ? parsed : undefined;
}

export async function createRoutingRuleAction(_previous: RoutingActionState, formData: FormData): Promise<RoutingActionState> {
  try {
    const mode = modeValue(formData.get("mode"));
    if (!mode) return { status: "error", message: "mode_invalid" };
    const productId = optionalString(formData.get("productId"));
    const exclusivePartnerTenantId = optionalString(formData.get("exclusivePartnerTenantId"));
    const description = optionalString(formData.get("description"));
    const rule = await createRoutingRule({
      countryId: stringValue(formData.get("countryId")),
      ...(productId ? { productId } : {}),
      mode,
      ...(maxRecipientsValue(formData.get("maxRecipients")) ? { maxRecipients: maxRecipientsValue(formData.get("maxRecipients")) as number } : {}),
      priorities: prioritiesValue(formData.get("priorities")),
      ...(exclusivePartnerTenantId ? { exclusivePartnerTenantId } : {}),
      ...(description ? { description } : {}),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/routing");
    return { status: "success", message: `Regle ${rule.mode} creee (version ${rule.version}).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateRoutingRuleAction(_previous: RoutingActionState, formData: FormData): Promise<RoutingActionState> {
  try {
    const ruleId = stringValue(formData.get("ruleId"));
    if (!ruleId) return { status: "error", message: "rule_required" };
    const mode = modeValue(formData.get("mode"));
    const status = stringValue(formData.get("status"));
    const prioritiesRaw = stringValue(formData.get("priorities"));
    const exclusivePartnerTenantId = optionalString(formData.get("exclusivePartnerTenantId"));
    const description = optionalString(formData.get("description"));
    const rule = await updateRoutingRule(ruleId, {
      ...(mode ? { mode } : {}),
      ...(maxRecipientsValue(formData.get("maxRecipients")) ? { maxRecipients: maxRecipientsValue(formData.get("maxRecipients")) as number } : {}),
      ...(status === "active" || status === "disabled" ? { status } : {}),
      ...(prioritiesRaw ? { priorities: prioritiesValue(prioritiesRaw) } : {}),
      ...(exclusivePartnerTenantId ? { exclusivePartnerTenantId } : {}),
      ...(description ? { description } : {}),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/routing");
    return { status: "success", message: `Regle mise a jour (version ${rule.version}, ${rule.status}).` };
  } catch (error) {
    return actionError(error);
  }
}

export async function assignPendingQuoteAction(_previous: RoutingActionState, formData: FormData): Promise<RoutingActionState> {
  try {
    const result = await assignPendingQuote(stringValue(formData.get("quoteRequestId")), {
      partnerTenantId: stringValue(formData.get("partnerTenantId")),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/routing");
    return { status: "success", message: `Demande assignee au courtier partenaire ${result.partnerTenantId.slice(0, 8)}.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function reassignLeadAction(_previous: RoutingActionState, formData: FormData): Promise<RoutingActionState> {
  try {
    const result = await reassignLead(stringValue(formData.get("assignmentId")), {
      partnerTenantId: stringValue(formData.get("partnerTenantId")),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/routing");
    revalidatePath("/lead-assignments");
    return { status: "success", message: `Lead reassigne vers ${result.partnerTenantId.slice(0, 8)} (statut ${result.status}).` };
  } catch (error) {
    return actionError(error);
  }
}
