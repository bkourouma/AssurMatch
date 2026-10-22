"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveContentEntry,
  archiveContentEntry,
  createContentEntry,
  rejectContentEntry,
  reviseContentEntry,
  submitContentEntry,
  updateContentEntry,
  withdrawContentEntry,
  type ContentApiError
} from "../lib/admin-api";
import { contentErrorMessage, isContentKind } from "../lib/content-messages";
import { payloadFromFormData, slugify } from "./content-payload";

export interface ContentActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

type ContentError = ContentApiError | Error;

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function actionError(error: unknown): ContentActionState {
  return { status: "error", message: contentErrorMessage(error as ContentError) };
}

function localeValue(value: FormDataEntryValue | null): "fr" | "en" {
  return stringValue(value) === "en" ? "en" : "fr";
}

/** The key of a faq/guide/glossary entry is typed or derived from its question / title / term. */
function derivedKey(kind: string, formData: FormData): string {
  const typed = stringValue(formData.get("entryKey"));
  if (typed) return typed;
  const source = kind === "faq" ? "faq_question" : kind === "guide" ? "guide_title" : "glossary_term";
  return slugify(stringValue(formData.get(source)));
}

export async function createContentEntryAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  let createdId: string;
  try {
    const kind = stringValue(formData.get("kind"));
    if (!isContentKind(kind)) return { status: "error", message: "Choisissez un type de contenu." };
    const payload = payloadFromFormData(kind, formData);
    const countryCode = stringValue(formData.get("countryCode")).toUpperCase();
    const entry = await createContentEntry({
      kind,
      entryKey: kind === "legal_override" ? stringValue(formData.get("legalSlug")) : derivedKey(kind, formData),
      locale: localeValue(formData.get("locale")),
      ...(kind === "legal_override" && countryCode ? { countryCode } : {}),
      payload
    });
    createdId = entry.id;
  } catch (error) {
    return actionError(error);
  }
  revalidatePath("/content");
  redirect(`/content/${encodeURIComponent(createdId)}?notice=created`);
}

export async function updateContentEntryAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  try {
    const id = stringValue(formData.get("id"));
    const kind = stringValue(formData.get("kind"));
    if (!id || !isContentKind(kind)) return { status: "error", message: "Contenu introuvable." };
    await updateContentEntry(id, payloadFromFormData(kind, formData));
    revalidatePath("/content");
    revalidatePath(`/content/${id}`);
    return { status: "success", message: "Brouillon enregistré. Il n'est visible d'aucun visiteur tant qu'il n'est pas approuvé." };
  } catch (error) {
    return actionError(error);
  }
}

const workflowIntents = ["submit", "withdraw", "approve", "reject", "archive", "revise"] as const;
type WorkflowIntent = (typeof workflowIntents)[number];

/** Submit / withdraw / approve / reject / archive / revise. Reject and archive require a note. */
export async function contentWorkflowAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const id = stringValue(formData.get("id"));
  const intent = stringValue(formData.get("intent")) as WorkflowIntent;
  const note = stringValue(formData.get("note"));
  if (!id || !workflowIntents.includes(intent)) return { status: "error", message: "Action inconnue." };
  if ((intent === "reject" || intent === "archive") && !note) {
    return { status: "error", message: "Un motif est obligatoire pour cette action." };
  }
  let revisedId: string | undefined;
  let message: string;
  try {
    switch (intent) {
      case "submit":
        await submitContentEntry(id);
        message = "Contenu soumis à validation. Un second acteur doit maintenant l'approuver.";
        break;
      case "withdraw":
        await withdrawContentEntry(id);
        message = "Soumission retirée : le contenu est redevenu un brouillon modifiable.";
        break;
      case "approve":
        await approveContentEntry(id, note || undefined);
        message = "Contenu approuvé et publié. Une version publiée précédente de la même clé est archivée.";
        break;
      case "reject":
        await rejectContentEntry(id, note);
        message = "Contenu rejeté : il est redevenu un brouillon, avec le motif en traçabilité.";
        break;
      case "archive":
        await archiveContentEntry(id, note);
        message = "Contenu archivé : il n'est plus affiché sur le site public.";
        break;
      case "revise":
        revisedId = (await reviseContentEntry(id)).id;
        message = "Nouvelle version en brouillon créée.";
        break;
    }
  } catch (error) {
    return actionError(error);
  }
  revalidatePath("/content");
  revalidatePath(`/content/${id}`);
  if (revisedId) redirect(`/content/${encodeURIComponent(revisedId)}?notice=revised`);
  return { status: "success", message };
}
