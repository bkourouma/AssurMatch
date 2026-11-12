import { expect, type Browser, type Page } from "@playwright/test";
import { api, itemsOfBody, rec } from "./admin-lot11";
import { activateAccountWithCodes } from "./edge-p0p1-activation";
import { e2ePassword, newAppContext, openAs, type BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";
import { loadJourneyState, requireState } from "./journey-state";
import { extractLink, waitForMail } from "./mailpit";
import { adminBearerToken } from "./recos-062b";
import { uniqueSuffix } from "./ui";

// Lot 2 (edge cases of phases 0 and 1): throwaway admin accounts that may be damaged by the tests (wrong
// passwords, locked, suspended...). The shared Super Admin of the scenario is only used to CREATE them and for
// plain valid logins, never for a failing attempt (5 failures lock an account, and the other lots rely on it).

export interface EdgeAccount extends BackOfficeAccount {
  /** The 8 one-shot backup codes shown at MFA enrolment. */
  backupCodes: string[];
}

export function sharedSuperAdmin(): BackOfficeAccount {
  return requireState(loadJourneyState(), "superAdmin");
}

export function sharedComplianceAdmin(): BackOfficeAccount {
  return requireState(loadJourneyState(), "complianceAdmin");
}

export function sharedCountryId(): string {
  return requireState(loadJourneyState(), "countryId");
}

export const EDGE_REASON = "Motif E2E L2 valide";

/** Suffix of every name created by lot 2: "E2E Courtage L2-<timestamp>". */
export const L2_TAG = `E2E Courtage L2-${Date.now()}`;

export interface CreateAdminAccountOptions {
  roles: string[];
  /** a-z0-9 label used in the e-mail address. */
  label: string;
  /** Country UUIDs of the scope (admin_pays). */
  countryIds?: string[];
  /** The admin who creates it (default: the shared Super Admin). */
  creator?: BackOfficeAccount;
  /** Page already logged in as `creator`; when absent a new one is opened. */
  creatorPage?: Page;
}

/**
 * The Super Admin creates an admin user on /users ("Créer et émettre activation"), the e-mail is read from
 * Mailpit, the account is activated and MFA enrolled; the TOTP secret AND the backup codes are captured.
 */
export async function createAdminAccount(browser: Browser, options: CreateAdminAccountOptions): Promise<EdgeAccount> {
  const email = `l2.${options.label}.${uniqueSuffix()}@e2e.assurmatch.test`;
  const creator = options.creator ?? sharedSuperAdmin();
  const ownPage = options.creatorPage === undefined;
  const page = options.creatorPage ?? (await (await newAppContext(browser, e2eEnv.adminUrl)).newPage());
  await openAs(page, creator, "/users");
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Créer et émettre activation" }) });
  await create.locator("input[name='email']").fill(email);
  await create.locator("input[name='displayName']").fill(`${L2_TAG} ${options.label}`);
  for (const role of options.roles) await create.locator(`input[name='roles'][value='${role}']`).check();
  if (options.countryIds?.length) await create.locator("input[name='countryScopes']").fill(options.countryIds.join(","));
  await create.locator("textarea[name='reason']").fill(EDGE_REASON);
  await create.getByRole("button", { name: "Créer et émettre activation" }).click();
  await expect(create.locator(".bo-notice[data-tone='success']").first()).toBeVisible({ timeout: 30_000 });
  const mail = await waitForMail({ to: email });
  const link = extractLink(mail, /\/activate\?token=/u);
  if (ownPage) await page.context().close();

  const activationPage = await (await newAppContext(browser, e2eEnv.adminUrl)).newPage();
  const password = e2ePassword(options.label);
  const { totpSecret, backupCodes } = await activateAccountWithCodes(activationPage, link, password);
  await activationPage.context().close();
  return { app: "admin", email, password, totpSecret, backupCodes };
}

/** The API bearer token of a logged-in admin page. */
export async function tokenOfPage(page: Page): Promise<string> {
  return adminBearerToken(page);
}

/** Id of an admin user, looked up by e-mail through the API (all pages of /admin/users). */
export async function userIdByEmail(token: string, email: string): Promise<string> {
  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const result = await api(token, "GET", `/admin/users?page=${pageNumber}&pageSize=100`);
    expect(result.status, `list users -> ${result.text.slice(0, 200)}`).toBe(200);
    const items = itemsOfBody(result.body);
    const found = items.find((item) => String(rec(item).email).toLowerCase() === email.toLowerCase());
    if (found) return String(found.id);
    if (items.length < 100) break;
  }
  throw new Error(`user ${email} not found`);
}
