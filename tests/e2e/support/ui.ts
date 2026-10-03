import { expect, type Locator, type Page } from "@playwright/test";

// Generic helpers for the shared back-office design system (packages/ui/backoffice): every server
// action renders its result as a `.bo-notice` (tone success / danger / warning) inside its form or
// card, and sensitive actions open a native <dialog> (ConfirmDialog).

/** Waits for the result notice of an action and fails with its text when the action was refused. */
export async function expectActionSuccess(scope: Locator, what: string): Promise<void> {
  const notice = scope.locator(".bo-notice[data-tone='success'], .bo-notice[data-tone='danger']").first();
  await expect(notice, `${what}: no result notice`).toBeVisible({ timeout: 30_000 });
  const tone = await notice.getAttribute("data-tone");
  if (tone !== "success") {
    throw new Error(`${what} refused: ${(await notice.innerText()).replace(/\s+/gu, " ").trim()}`);
  }
}

/** Fills the audited reason field of a form ("Motif (audite)"). */
export async function fillReason(scope: Locator, reason: string): Promise<void> {
  await scope.getByLabel(/Motif/).filter({ visible: true }).first().fill(reason);
}

/**
 * Submits a ConfirmDialog: clicks its trigger (inside `scope`), fills the dialog fields and confirms.
 * A successful action usually re-renders the page and unmounts the dialog; a refusal keeps it open
 * with a danger notice, which fails here with the server's message. The caller then asserts the
 * visible outcome (new status, new row...).
 */
export async function confirmInDialog(
  page: Page,
  scope: Locator,
  triggerLabel: string | RegExp,
  fill: (dialog: Locator) => Promise<void>,
  confirmLabel?: string | RegExp
): Promise<void> {
  await scope.getByRole("button", { name: triggerLabel }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await fill(dialog);
  await dialog.getByRole("button", { name: confirmLabel ?? triggerLabel }).last().click();
  const label = String(confirmLabel ?? triggerLabel);
  await expect
    .poll(async () => {
      if ((await dialog.count()) === 0) return "closed";
      const danger = dialog.locator(".bo-notice[data-tone='danger']");
      if (await danger.count()) return `refused: ${(await danger.first().innerText()).replace(/\s+/gu, " ").trim()}`;
      if (await dialog.locator(".bo-notice[data-tone='success']").count()) return "closed";
      return "pending";
    }, { timeout: 30_000, message: `dialog action ${label}` })
    .not.toBe("pending");
  const danger = dialog.locator(".bo-notice[data-tone='danger']");
  if ((await dialog.count()) > 0 && (await danger.count()) > 0) {
    throw new Error(`${label} refused: ${(await danger.first().innerText()).replace(/\s+/gu, " ").trim()}`);
  }
  // Close a dialog left open after a success notice so it does not cover the page.
  if ((await dialog.count()) > 0) await dialog.getByRole("button", { name: /Annuler|Fermer/u }).first().click().catch(() => undefined);
}

/** A Card of the design system, found by its title. */
export function card(scope: Page | Locator, title: string | RegExp): Locator {
  const pattern = typeof title === "string" ? new RegExp(`^\\s*${escapeRegExp(title)}\\s*$`) : title;
  const heading = scope.locator("h2.bo-section-title").filter({ hasText: pattern });
  // Nearest enclosing card of the title (cards can be nested).
  return heading.first().locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' bo-card ')][1]");
}

/** Table row (DataTable) containing every given cell text. */
export function rowWith(scope: Page | Locator, ...cells: Array<string | RegExp>): Locator {
  let row = scope.getByRole("row");
  for (const cell of cells) row = row.filter({ hasText: cell });
  return row.first();
}

/** Last path segment of the current URL (an entity id). */
export function idFromUrl(page: Page): string {
  const segments = new URL(page.url()).pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) throw new Error(`no id in ${page.url()}`);
  return decodeURIComponent(last);
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
