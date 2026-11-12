import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";
import type { BackOfficeAccount } from "./backoffice";
import { openAs } from "./edge-p5p7-login";
import { e2eEnv } from "./env";
import type { BrokerWorld } from "./journey-state";
import { card } from "./ui";
import { findAssignmentId, provisionBroker, publishOffer, requestQuote, type VisitorQuote } from "./world";

// Lot 4 (edge cases of phases 5 to 7): shared building blocks of tests/e2e/edge-p5-p7-*.spec.ts.
//
// - Own state file (.local/e2e/edge-p5p7-state.json): the lot never writes journey-state.json, which
//   the other lots running on the same stack also use.
// - Rate-limit guards: the visitor routes of the API count per IP (127.0.0.1 for the whole stack) in
//   Redis. The lot never TESTS a limit; it only keeps its own traffic under the ceilings (quote
//   requests: 5 per minute; tracking page: 60 per hour; ...) and, as a last resort on this throwaway
//   stack, clears a counter that cannot absorb the next step (logged in edge-p5p7-rate-resets.log).

export const L4_REASON = "Parcours E2E lot 4 (cas limites phases 5 a 7)";

const STATE_FILE = path.resolve(".local", "e2e", "edge-p5p7-state.json");
const RESET_LOG = path.resolve(".local", "e2e", "edge-p5p7-rate-resets.log");

// ---------------------------------------------------------------------------------------------
// Own state (firms), safe for several spec files writing at the same time (read-merge-write, atomic rename)
// ---------------------------------------------------------------------------------------------

interface L4State {
  firms?: Record<string, BrokerWorld>;
}

function readState(): L4State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as L4State;
  } catch {
    return {};
  }
}

export function loadFirm(key: string): BrokerWorld | undefined {
  return readState().firms?.[key];
}

export function saveFirm(key: string, world: BrokerWorld): void {
  const state = readState();
  const next: L4State = { ...state, firms: { ...(state.firms ?? {}), [key]: world } };
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temp, STATE_FILE);
}

/**
 * Builds (or resumes) a Starter broker firm of the lot: owner activated with MFA, one published CI x Auto
 * offer. `key` names the firm in the state file ("l4q", "l4p", "l4f"...); `label` is used in names/e-mails.
 */
export async function ensureL4Firm(browser: Browser, key: string, label: string, plan: "starter" | "pro" = "starter"): Promise<BrokerWorld> {
  let world = loadFirm(key);
  if (!world) {
    world = await provisionBroker(browser, { plan, label });
    saveFirm(key, world);
  }
  if (!world.offerId || !world.offerTitle) {
    const offer = await publishOffer(browser, world, label);
    world.offerId = offer.offerId;
    world.offerTitle = offer.offerTitle;
    saveFirm(key, world);
  }
  return world;
}

// ---------------------------------------------------------------------------------------------
// Redis rate-limit counters (docker exec on the e2e Redis container; read-only except resetKey)
// ---------------------------------------------------------------------------------------------

const REDIS_CONTAINER = `${process.env.E2E_COMPOSE_PROJECT ?? "assurmatch-e2e"}-redis-1`;
const REDIS_PORT = process.env.ASSURMATCH_E2E_REDIS_PORT ?? "48679";

function redis(...args: string[]): string {
  const result = spawnSync("docker", ["exec", REDIS_CONTAINER, "redis-cli", "-p", REDIS_PORT, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`redis-cli ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function scanKeys(pattern: string): string[] {
  const out = redis("--scan", "--pattern", pattern);
  return out ? out.split(/\r?\n/u).filter(Boolean) : [];
}

/** Counters of public scope `rl:public:<scope>:<ipHash>` (every IP hash: the stack has a single client address). */
export function publicScopeUsage(scope: string): { key: string; count: number; ttlSeconds: number } | undefined {
  const key = scanKeys(`rl:public:${scope}:*`)[0];
  if (!key) return undefined;
  return { key, count: Number.parseInt(redis("get", key) || "0", 10), ttlSeconds: Number.parseInt(redis("ttl", key), 10) };
}

/**
 * Makes sure `needed` more calls of a public scope fit under `limit`. When they do not, the counter of this
 * throwaway stack is cleared (and the reset is logged) rather than letting the next call lock the IP for an hour.
 * Returns true when a reset happened. Scopes: tracking_status (60/h), proposal_response (10/h), lead_message (30/h),
 * consent_withdrawal (5/h), data_request (5/h), tracking_link_resend (5/h).
 */
export function ensureRateBudget(scope: string, limit: number, needed: number, note: string): boolean {
  const usage = publicScopeUsage(scope);
  if (!usage || usage.count + needed <= limit - 2) return false;
  redis("del", usage.key);
  mkdirSync(path.dirname(RESET_LOG), { recursive: true });
  appendFileSync(RESET_LOG, `${new Date().toISOString()} ${scope} count=${usage.count} needed=${needed} limit=${limit} :: ${note}\n`);
  return true;
}

/**
 * Waits until the quote-request window (5 per minute per IP, country and product; fixed window) can absorb one
 * more submission (keeps one slot of margin for the other lots). Every spec that submits a quote calls it first.
 */
export async function quoteSlot(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const keys = scanKeys("rl:quote:*");
    const counts = keys.map((key) => ({ count: Number.parseInt(redis("get", key) || "0", 10), ttl: Number.parseInt(redis("ttl", key), 10) }));
    const busiest = counts.sort((a, b) => b.count - a.count)[0];
    // Three spec files of the lot run side by side, plus the other lots: keep two slots of margin.
    if (!busiest || busiest.count < 3) return;
    await new Promise((resolve) => setTimeout(resolve, Math.max(busiest.ttl, 1) * 1000 + 500));
  }
  throw new Error("quote rate window never freed");
}

/** Counts a tracking-page consultation budget before a spec opens `views` tracking pages (60 per hour per IP). */
export function reserveTrackingViews(views: number, note: string): void {
  ensureRateBudget("tracking_status", 60, views, note);
}

// ---------------------------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------------------------

export interface L4Lead extends VisitorQuote {
  assignmentId: string;
}

/**
 * A visitor asks for a quote on the firm's offer (real screens, with the named consent), the owner finds
 * the lead; with `accept` the owner presses "Accepter". Waits for a free quote slot first.
 */
export async function createLead(browser: Browser, firm: BrokerWorld, label: string, options: { accept?: boolean; phone?: string } = {}): Promise<L4Lead> {
  if (!firm.offerTitle) throw new Error(`firm ${firm.partnerName} has no offer`);
  await quoteSlot();
  const quote = await requestQuote(browser, firm.offerTitle, firm.partnerName, label, options.phone ? { phone: options.phone } : {});
  const page = await (await browser.newContext({ baseURL: e2eEnv.brokerUrl, locale: "fr-FR", timezoneId: "Africa/Abidjan" })).newPage();
  let assignmentId = "";
  await expect
    .poll(async () => {
      try {
        assignmentId = await findAssignmentId(page, firm.owner, quote.reference);
        return assignmentId;
      } catch {
        return "";
      }
    }, { timeout: 90_000, intervals: [2_000, 3_000], message: `lead ${quote.reference} for ${firm.partnerName}` })
    .toMatch(/^[0-9a-f-]{36}$/u);
  if (options.accept) await acceptStarterLead(page, firm.owner, assignmentId);
  await page.context().close();
  return { ...quote, assignmentId };
}

/** Starter lead page: "Accepter" (nothing to do when already accepted). */
export async function acceptStarterLead(page: Page, owner: BackOfficeAccount, assignmentId: string): Promise<void> {
  await openAs(page, owner, `/leads/${assignmentId}`);
  const actions = card(page, "Actions Starter");
  const accept = actions.getByRole("button", { name: "Accepter", exact: true });
  if ((await accept.count()) === 0) return;
  await accept.click();
  await expect(page.getByText("Lead accepté.")).toBeVisible();
}

/** The token of a tracking link. */
export function tokenOfLink(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`no token in ${link}`);
  return token;
}

/** Appends a line to the lot's observation log (anomalies and measured values read back by the report). */
export function note(line: string): void {
  const file = path.resolve(".local", "e2e", "edge-p5p7-notes.log");
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
}

export function stateFileExists(): boolean {
  return existsSync(STATE_FILE);
}
