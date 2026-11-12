import { expect, request, type Locator, type Page } from "@playwright/test";
import { e2eEnv } from "./env";
import type { ApiResult } from "./pro-roles";

// Helpers of the lot 3 edge cases of phase 2 (company profile, licence renewal, team, rights):
// result-notice reading that never throws (the cases assert the refusal texts), browser-validation
// bypass (the screens carry native `type=email` / `minLength` constraints that stop most bad
// inputs before the server action), dialog / 5xx watchers and a multipart upload straight to the API.
// Nothing here modifies an existing helper; everything targets the throwaway brokers of the spec.

export const LABEL = `E2E Courtage L3-${Date.now()}`;

export const XSS_SCRIPT = "<script>alert(1)</script>";
export const XSS_IMG = "\"><img src=x onerror=alert(1)>";
export const SQL_DROP = "'; DROP TABLE leads;--";

export interface NoticeRead {
  tone: string;
  text: string;
}

/** The notices currently shown in `scope` (tone + normalised text). */
export async function readNotices(scope: Locator): Promise<NoticeRead[]> {
  const notices = scope.locator(".bo-notice[data-tone]");
  const count = await notices.count();
  const result: NoticeRead[] = [];
  for (let index = 0; index < count; index += 1) {
    const notice = notices.nth(index);
    result.push({ tone: (await notice.getAttribute("data-tone")) ?? "", text: (await notice.innerText()).replace(/\s+/gu, " ").trim() });
  }
  return result;
}

/**
 * Clicks `button` and returns the result notice of the action once it settled. A server action
 * re-renders the notice in place, so the previous notices are remembered and the call waits until
 * the notice list changed (or, when the same message comes back, until the button is usable again).
 */
export async function submitAndRead(scope: Locator, button: Locator, timeoutMs = 30_000): Promise<NoticeRead> {
  const before = JSON.stringify(await readNotices(scope));
  await button.click();
  const deadline = Date.now() + timeoutMs;
  await scope.page().waitForTimeout(400);
  for (;;) {
    const now = await readNotices(scope);
    const enabled = await button.isEnabled().catch(() => true);
    if (now.length > 0 && enabled && (JSON.stringify(now) !== before || Date.now() > deadline - timeoutMs + 3_000)) return now[0] as NoticeRead;
    if (Date.now() > deadline) throw new Error(`no result notice after submit (before: ${before})`);
    await scope.page().waitForTimeout(250);
  }
}

/** Turns the native browser validation off for the form around `field` (the server rules are then the only guard). */
export async function bypassValidation(field: Locator): Promise<void> {
  await field.evaluate((element) => {
    const form = element.closest("form");
    if (form) form.noValidate = true;
  });
}

/** True when the browser itself would refuse the field's current value (type mismatch, too short...). */
export async function nativelyInvalid(field: Locator): Promise<boolean> {
  return field.evaluate((element) => !(element as HTMLInputElement).validity.valid);
}

export interface PageWatch {
  dialogs: string[];
  serverErrors: string[];
}

const watched = new WeakMap<Page, PageWatch>();

/** Records every JS dialog (alert / confirm / prompt, dismissed at once) and every 5xx response of the page. */
export function watchPage(page: Page): PageWatch {
  const known = watched.get(page);
  if (known) return known;
  const watch: PageWatch = { dialogs: [], serverErrors: [] };
  page.on("dialog", (dialog) => {
    watch.dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => undefined);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) watch.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  watched.set(page, watch);
  return watch;
}

/** A member-row action (deactivate / reactivate / role) of /team: opens the dialog, fills it, confirms, reads the notice. */
export async function teamMemberAction(
  page: Page,
  displayName: string,
  trigger: "Désactiver" | "Réactiver" | "Changer le rôle",
  options: { reason: string; role?: string; bypass?: boolean }
): Promise<{ notice: NoticeRead | undefined; reasonInvalidNatively: boolean }> {
  const row = page.getByRole("row").filter({ hasText: displayName }).first();
  await row.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.locator("dialog[open]").last();
  await expect(dialog).toBeVisible();
  if (options.role) await dialog.locator("select[name='role']").selectOption(options.role);
  const reason = dialog.locator("input[name='reason']");
  await reason.fill(options.reason);
  const reasonInvalidNatively = await nativelyInvalid(reason);
  if (options.bypass) await bypassValidation(reason);
  const before = JSON.stringify(await readNotices(row));
  await dialog.getByRole("button", { name: trigger, exact: true }).last().click();
  // The notice lives next to the dialog (in the row), not inside it.
  const deadline = Date.now() + 30_000;
  let notice: NoticeRead | undefined;
  await page.waitForTimeout(500);
  while (Date.now() < deadline) {
    const now = await readNotices(page.getByRole("row").filter({ hasText: displayName }).first());
    if (now.length > 0 && JSON.stringify(now) !== before) {
      notice = now[0];
      break;
    }
    if (reasonInvalidNatively && !options.bypass) break;
    await page.waitForTimeout(300);
  }
  // Close a dialog that is still open.
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((element) => (element as HTMLDialogElement).close()));
  return { notice, reasonInvalidNatively };
}

/** `PATCH` / `DELETE`-capable API call (the shared `apiCall` stops at GET / POST / PUT). */
export async function call(token: string | undefined, method: "GET" | "POST" | "PATCH", path: string, data?: Record<string, unknown>): Promise<ApiResult> {
  const context = await request.newContext({
    baseURL: e2eEnv.apiUrl,
    ...(token ? { extraHTTPHeaders: { Authorization: `Bearer ${token}` } } : {})
  });
  try {
    const response = await context.fetch(path, { method, ...(data ? { data } : {}) });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: response.status(), body, text };
  } finally {
    await context.dispose();
  }
}

/** Multipart upload of a licence proof straight to the API (what the broker app's route handler forwards). */
export async function uploadProofToApi(token: string, licenseId: string, file: { name: string; mimeType: string; buffer: Buffer }): Promise<ApiResult> {
  const context = await request.newContext({ baseURL: e2eEnv.apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const response = await context.fetch(`/broker/licenses/${licenseId}/documents`, {
      method: "POST",
      multipart: { file: { name: file.name, mimeType: file.mimeType, buffer: file.buffer } }
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: response.status(), body, text };
  } finally {
    await context.dispose();
  }
}

/** A buffer that starts with the PDF magic bytes and is `size` bytes long. */
export function pdfOfSize(name: string, size: number): { name: string; mimeType: string; buffer: Buffer } {
  const buffer = Buffer.alloc(size, 0x20);
  buffer.write("%PDF-1.4\n", 0, "latin1");
  buffer.write("\n%%EOF\n", Math.max(size - 7, 9), "latin1");
  return { name, mimeType: "application/pdf", buffer };
}

export function messageOf(result: ApiResult): string {
  const body = result.body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message;
    const code = record.code;
    return `${typeof code === "string" ? `${code} ` : ""}${Array.isArray(message) ? message.join("; ") : String(message ?? "")}`.trim();
  }
  return result.text.slice(0, 200);
}
