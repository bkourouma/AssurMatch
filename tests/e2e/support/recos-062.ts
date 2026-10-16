import { expect, request as playwrightRequest, type Browser, type Page } from "@playwright/test";
import { openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { loadWorld, saveWorld, type BrokerWorld } from "./journey-state";
import { card } from "./ui";
import { appPage, provisionBroker, publishOffer, requestQuote } from "./world";

// Spec 065 / lot 062: building blocks of recos-062-messaging.spec.ts (broker <-> visitor messaging).
// Two small firms (Starter and Pro), each with a published offer and two accepted leads (A and B),
// and the API probes used to prove a refusal at the API level (the screens only show it).

export const MESSAGING_FLAG = "broker_visitor_messaging_enabled";
export type Lead = "A" | "B";

/**
 * Journey-state keys of the firms of the CURRENT run. The conversations keep their history and the pointer
 * e-mails are coalesced per 15-minute bucket, so a finished run is never resumed: the next run builds new
 * firms. A run that did not finish (no `done` marker) is resumed on its own firms.
 */
export function activeRun(): { starter: string; pro: string } {
  for (let n = 1; ; n += 1) {
    const keys = { starter: `m062s${n}`, pro: `m062p${n}` };
    if (loadWorld(keys.starter)?.data.done !== "1") return keys;
  }
}

/** Marks the current run as finished (both firms) so the next run starts on new firms. */
export function markRunDone(): void {
  const keys = activeRun();
  for (const key of [keys.starter, keys.pro]) {
    const world = loadWorld(key);
    if (!world) continue;
    world.data.done = "1";
    saveWorld(key, world);
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u;

/** One lead of a firm: QR- reference, visitor address, original magic link, assignment id (after location). */
export interface FirmLead {
  reference: string;
  email: string;
  trackingLink: string;
  assignmentId: string;
}

export function leadOf(world: BrokerWorld, lead: Lead): FirmLead {
  const data = world.data;
  const reference = data[`lead${lead}Ref`];
  const email = data[`lead${lead}Email`];
  const trackingLink = data[`lead${lead}Link`];
  const assignmentId = data[`lead${lead}Id`];
  if (!reference || !email || !trackingLink || !assignmentId) throw new Error(`lead ${lead} of ${world.partnerName} is not set up: run MSG-00 first`);
  return { reference, email, trackingLink, assignmentId };
}

/** The `token` of a magic link. */
export function tokenOf(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`no token in ${link}`);
  return token;
}

/** Polls the broker's lead list until the lead of `reference` shows up and returns its assignment id. */
async function locateAssignment(page: Page, account: BackOfficeAccount, reference: string, listPath: string): Promise<string> {
  let href = "";
  await expect
    .poll(
      async () => {
        await openAs(page, account, listPath);
        const link = page.getByRole("row").filter({ hasText: reference }).getByRole("link").first();
        href = (await link.count()) > 0 ? ((await link.getAttribute("href")) ?? "") : "";
        return href;
      },
      { timeout: 90_000, intervals: [2_000, 3_000], message: `lead ${reference} in ${listPath}` }
    )
    .toMatch(UUID);
  return href.match(UUID)?.[0] as string;
}

/** Starter: finds the lead and presses "Accepter" (idempotent: nothing to do when already accepted). */
async function acceptStarterLead(page: Page, account: BackOfficeAccount, assignmentId: string): Promise<void> {
  await openAs(page, account, `/leads/${assignmentId}`);
  const actions = card(page, "Actions Starter");
  const accept = actions.getByRole("button", { name: "Accepter", exact: true });
  if ((await accept.count()) === 0) return;
  await accept.click();
  await expect(page.getByText("Lead accepte.")).toBeVisible();
}

/** Pro: moves the lead to the CRM status "Accepte" (the conversation opens on any status but "nouveau"). */
async function acceptCrmLead(page: Page, account: BackOfficeAccount, assignmentId: string): Promise<void> {
  await openAs(page, account, `/crm/leads/${assignmentId}`);
  const form = card(page, /^\s*Changer le statut\s*$/u);
  const select = form.locator("#crm-new-status");
  const offered = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  if (!offered.includes("accepte")) return; // already past "nouveau"
  await select.selectOption("accepte");
  await form.getByRole("button", { name: "Enregistrer le statut" }).click();
  await page.waitForURL(/[?&]crm=/u);
  expect(new URL(page.url()).searchParams.get("crm"), `CRM status outcome (${page.url()})`).toBe("status_changed");
}

/**
 * Builds (or resumes) a broker firm of the given plan with a published offer and two ACCEPTED leads
 * (A and B), each with its own visitor. Every step is saved so a re-run on the same stack resumes.
 */
export async function ensureFirm(browser: Browser, key: string, plan: "starter" | "pro", label: string): Promise<BrokerWorld> {
  let world = loadWorld(key);
  if (!world) {
    world = await provisionBroker(browser, { plan, label });
    saveWorld(key, world);
  }
  if (!world.offerId || !world.offerTitle) {
    const offer = await publishOffer(browser, world, label);
    world.offerId = offer.offerId;
    world.offerTitle = offer.offerTitle;
    saveWorld(key, world);
  }
  for (const lead of ["A", "B"] as const) {
    if (world.data[`lead${lead}Ref`]) continue;
    const quote = await requestQuote(browser, world.offerTitle, world.partnerName, `${label}${lead.toLowerCase()}`);
    world.data[`lead${lead}Ref`] = quote.reference;
    world.data[`lead${lead}Email`] = quote.email;
    world.data[`lead${lead}Link`] = quote.trackingLink;
    saveWorld(key, world);
  }
  const broker = await appPage(browser, e2eEnv.brokerUrl);
  for (const lead of ["A", "B"] as const) {
    if (world.data[`lead${lead}Id`]) continue;
    const reference = world.data[`lead${lead}Ref`] as string;
    const id = await locateAssignment(broker, world.owner, reference, plan === "starter" ? "/leads" : "/crm/leads");
    if (plan === "starter") await acceptStarterLead(broker, world.owner, id);
    else await acceptCrmLead(broker, world.owner, id);
    world.data[`lead${lead}Id`] = id;
    saveWorld(key, world);
  }
  await broker.context().close();
  return world;
}

// ---------------------------------------------------------------------------------------------
// API probes
// ---------------------------------------------------------------------------------------------

export interface ProbeResult {
  status: number;
  body: Record<string, unknown>;
  text: string;
}

function parse(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface MultipartFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A GET / JSON POST to the API (anonymous, like a visitor with a magic link). */
export async function probe(method: "GET" | "POST", path: string, json?: Record<string, unknown>): Promise<ProbeResult> {
  const context = await playwrightRequest.newContext({ baseURL: e2eEnv.apiUrl });
  try {
    const response = await context.fetch(path, { method, ...(json ? { data: json } : {}) });
    const text = await response.text();
    return { status: response.status(), body: parse(text), text };
  } finally {
    await context.dispose();
  }
}

/** Multipart with several parts named `files` (Playwright's helper only takes unique names). */
export async function uploadFiles(path: string, files: MultipartFile[]): Promise<ProbeResult> {
  const boundary = `----e2e${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`, "utf8"));
    chunks.push(file.buffer, Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  const context = await playwrightRequest.newContext({ baseURL: e2eEnv.apiUrl });
  try {
    const response = await context.fetch(path, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      data: Buffer.concat(chunks)
    });
    const text = await response.text();
    return { status: response.status(), body: parse(text), text };
  } finally {
    await context.dispose();
  }
}

/** The visitor's conversations of a request (token of the magic link). */
export async function visitorConversations(lead: FirmLead): Promise<ProbeResult> {
  return probe("GET", `/quote-requests/${lead.reference}/conversations?token=${encodeURIComponent(tokenOf(lead.trackingLink))}`);
}

/** Opaque id of the single conversation of a request. */
export async function visitorConversationId(lead: FirmLead): Promise<string> {
  const list = await visitorConversations(lead);
  expect(list.status, "visitor lists the conversations").toBe(200);
  const conversations = (list.body.conversations ?? []) as Array<{ conversationId: string }>;
  expect(conversations.length, "one conversation (one broker)").toBe(1);
  return (conversations[0] as { conversationId: string }).conversationId;
}

/** Mailpit message JSON (attachments are not part of the shared MailMessage type). */
export async function mailpitAttachmentCount(id: string): Promise<number> {
  const response = await fetch(`${e2eEnv.mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Mailpit message ${id}: HTTP ${response.status}`);
  const message = (await response.json()) as { Attachments?: unknown[]; Inline?: unknown[] };
  return (message.Attachments?.length ?? 0) + (message.Inline?.length ?? 0);
}
