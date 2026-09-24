"use server";

import { revalidatePath } from "next/cache";
import {
  createQuoteFormDefinition,
  publishQuoteFormDefinition,
  retireQuoteFormDefinition,
  type QuoteFormFieldInput
} from "../lib/admin-api";

export interface QuoteFormActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const fieldTypes: QuoteFormFieldInput["type"][] = ["text", "email", "phone", "number", "select", "checkbox", "date"];
const sensitivities: QuoteFormFieldInput["sensitivity"][] = ["public", "personal", "sensitive"];

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  const text = stringValue(value);
  return text ? text : undefined;
}

function actionError(error: unknown): QuoteFormActionState {
  return { status: "error", message: error instanceof Error ? error.message : "action_failed" };
}

/**
 * Fields are typed one per line as `key|label|type|required|sensitivity|option,option`.
 * A definition with no parsable field is refused here rather than sent to the API, because an empty
 * form would be a published public surface collecting nothing.
 */
function fieldsValue(value: FormDataEntryValue | null): QuoteFormFieldInput[] {
  return stringValue(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key = "", label = "", type = "text", required = "true", sensitivity = "public", options = ""] = line.split("|").map((part) => part.trim());
      const parsedOptions = options.split(",").map((option) => option.trim()).filter(Boolean);
      return {
        key,
        label,
        type: fieldTypes.find((candidate) => candidate === type) ?? "text",
        required: required !== "false",
        sensitivity: sensitivities.find((candidate) => candidate === sensitivity) ?? "public",
        ...(parsedOptions.length > 0 ? { options: parsedOptions } : {})
      } satisfies QuoteFormFieldInput;
    })
    .filter((field) => field.key.length > 0 && field.label.length > 0);
}

export async function createQuoteFormDefinitionAction(_previous: QuoteFormActionState, formData: FormData): Promise<QuoteFormActionState> {
  try {
    const fields = fieldsValue(formData.get("fields"));
    if (fields.length === 0) return { status: "error", message: "fields_invalid" };
    const dataMinimizationNotes = optionalString(formData.get("dataMinimizationNotes"));
    const form = await createQuoteFormDefinition({
      countryId: stringValue(formData.get("countryId")),
      productId: stringValue(formData.get("productId")),
      language: stringValue(formData.get("language")) || "fr",
      version: stringValue(formData.get("version")),
      fields,
      consentTextId: stringValue(formData.get("consentTextId")),
      ...(dataMinimizationNotes ? { dataMinimizationNotes } : {}),
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/quote-form-definitions");
    return { status: "success", message: `Brouillon cree: ${form.id}. Il n'est pas encore expose aux visiteurs.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function publishQuoteFormDefinitionAction(_previous: QuoteFormActionState, formData: FormData): Promise<QuoteFormActionState> {
  try {
    const form = await publishQuoteFormDefinition(stringValue(formData.get("formId")), stringValue(formData.get("reason")));
    revalidatePath("/quote-form-definitions");
    return { status: "success", message: `Version ${form.version} publiee. Toute version precedente pour ce pays/produit/langue est retiree.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function retireQuoteFormDefinitionAction(_previous: QuoteFormActionState, formData: FormData): Promise<QuoteFormActionState> {
  try {
    const form = await retireQuoteFormDefinition(stringValue(formData.get("formId")), stringValue(formData.get("reason")));
    revalidatePath("/quote-form-definitions");
    return { status: "success", message: `Version ${form.version} retiree. Le formulaire n'est plus expose aux visiteurs.` };
  } catch (error) {
    return actionError(error);
  }
}
