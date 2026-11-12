import { expect, type Locator, type Page } from "@playwright/test";
import { eicarFile, pdfFile } from "./files";
import { apiCall } from "./pro-roles";
import { publicCall, tokenOfLink } from "./recos-062b";

// Lot 4 / spec file 03 (messaging and lead life cycle): upload fixtures, thread probes and the
// broker-side composer gestures. In-memory fixtures only, nothing is written to disk.

export type UploadFile = { name: string; mimeType: string; buffer: Buffer };

/** A well-formed PDF just over the 5 Mo cap (5 MiB + 1 KiB). */
export function bigPdf(name: string): UploadFile {
  const base = pdfFile(name, "Trop gros");
  return { ...base, buffer: Buffer.concat([base.buffer, Buffer.alloc(5 * 1024 * 1024 + 1024, 0x20)]) };
}

export function textFile(name: string): UploadFile {
  return { name, mimeType: "text/plain", buffer: Buffer.from("Simple note texte.", "utf8") };
}

export function emptyPdf(name: string): UploadFile {
  return { name, mimeType: "application/pdf", buffer: Buffer.alloc(0) };
}

export { eicarFile, pdfFile };

/** `n` distinct healthy PDFs. */
export function pdfFiles(prefix: string, n: number): UploadFile[] {
  return Array.from({ length: n }, (_, index) => pdfFile(`${prefix}-${index + 1}.pdf`, `${prefix} ${index + 1}`));
}

// ---------------------------------------------------------------------------------------------
// Thread probes
// ---------------------------------------------------------------------------------------------

/** Number of messages of the broker's thread of a Starter lead (API, owner token). */
export async function brokerThreadSize(token: string, assignmentId: string): Promise<number> {
  const result = await apiCall(token, "GET", `/broker/starter/leads/${assignmentId}/conversation?limit=300`);
  expect(result.status, `broker reads the thread -> ${result.text.slice(0, 200)}`).toBe(200);
  return (((result.body as { messages?: unknown[] }).messages) ?? []).length;
}

export interface VisitorLeadRef {
  reference: string;
  trackingLink: string;
}

/** The conversations of a request, read by the visitor API (token of the tracking link). */
export async function visitorThreads(lead: VisitorLeadRef): Promise<Array<{ conversationId: string; readOnlyReason: string | null; canSend: boolean }>> {
  const list = await publicCall("GET", `/quote-requests/${lead.reference}/conversations`, { token: tokenOfLink(lead.trackingLink) });
  expect(list.status, `visitor lists the conversations -> ${list.text.slice(0, 200)}`).toBe(200);
  return ((list.body as { conversations?: Array<{ conversationId: string; readOnlyReason: string | null; canSend: boolean }> }).conversations) ?? [];
}

/** Messages of the visitor's single thread (API). */
export async function visitorThreadMessages(lead: VisitorLeadRef): Promise<Array<{ senderType: string; body: string }>> {
  const [thread] = await visitorThreads(lead);
  if (!thread) return [];
  const view = await publicCall("GET", `/quote-requests/${lead.reference}/conversations/${thread.conversationId}`, { token: tokenOfLink(lead.trackingLink) });
  expect(view.status, `visitor reads the thread -> ${view.text.slice(0, 200)}`).toBe(200);
  return ((view.body as { messages?: Array<{ senderType: string; body: string }> }).messages) ?? [];
}

// ---------------------------------------------------------------------------------------------
// Broker composer
// ---------------------------------------------------------------------------------------------

export function brokerComposer(page: Page): Locator {
  return page.locator("form[aria-label='Nouveau message au visiteur']");
}

export function brokerRequestForm(page: Page): Locator {
  return page.locator("form[aria-label='Nouvelle demande de document']");
}

/** Fills the broker composer and presses send (files optional, one or several). */
export async function sendFromBroker(page: Page, text: string, files?: UploadFile | UploadFile[]): Promise<Locator> {
  const form = brokerComposer(page);
  await form.locator("textarea[name='body']").fill(text);
  if (files) await form.locator("input[name='files']").setInputFiles(files);
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  return form;
}
