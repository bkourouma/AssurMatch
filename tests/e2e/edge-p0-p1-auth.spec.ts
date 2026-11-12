import { expect, test, type Page } from "@playwright/test";
import { login, openAs, type BackOfficeAccount } from "./support/backoffice";
import { api, itemsOfBody, rec } from "./support/admin-lot11";
import { EDGE_REASON, createAdminAccount, sharedSuperAdmin, userIdByEmail, type EdgeAccount } from "./support/edge-p0p1-accounts";
import {
  adminContext,
  adminCookie,
  classifyText,
  currentCode,
  inviteAdmin,
  noticeTexts,
  observations,
  observe,
  passwordStep,
  resilientLogin,
  submitActivation
} from "./support/edge-p0p1-auth-support";
import { e2eEnv } from "./support/env";
import { extractLink, messageIdsTo, waitForMail } from "./support/mailpit";
import { closeSessions, sessionPage } from "./support/pro-roles";
import { adminBearerToken } from "./support/recos-062b";
import { loadJourneyState, requireState } from "./support/journey-state";
import { uniqueSuffix } from "./support/ui";

// Lot 2 (edge cases of phases 0 and 1), admin app authentication: E-P0-01a/b/d/e/f/g/h, lock-out, suspended
// account, T-09 (every authentication message really shown) and T-01 (audit of the auth actions).
// Every failing attempt targets a THROWAWAY account created here; shared accounts only log in validly.


const INVALID_TOKEN = { status: 400, codes: ["INVALID_TOKEN", "VALIDATION_FAILED"] };
const PASSWORD_POLICY = { status: 400, codes: ["PASSWORD_POLICY"] };
const WRONG_PASSWORD = "Mauvais-mot-de-passe-1!";
const GOOD_NEW_PASSWORD = `E2e-Inv-${Math.random().toString(36).slice(2, 10)}-Pw!7`;

let superAdmin: BackOfficeAccount;
let saPage: Page;
let main: EdgeAccount;
let lock: EdgeAccount;
let susp: EdgeAccount;
let invite: { email: string; link: string; password: string };

async function saToken(): Promise<string> {
  await openAs(saPage, superAdmin, "/");
  return adminBearerToken(saPage);
}

test.describe("Authentification admin (serie)", () => {
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  superAdmin = sharedSuperAdmin();
  saPage = await sessionPage(browser, superAdmin);
  await openAs(saPage, superAdmin, "/users");
  main = await createAdminAccount(browser, { roles: ["support_admin"], label: "authmain", creatorPage: saPage });
  lock = await createAdminAccount(browser, { roles: ["support_admin"], label: "authlock", creatorPage: saPage });
  susp = await createAdminAccount(browser, { roles: ["support_admin"], label: "authsusp", creatorPage: saPage });
  invite = await inviteAdmin(saPage, superAdmin, "authinv", ["support_admin"]);
});

test.afterAll(async () => {
  console.log("[OBS TABLE]\n" + observations.map((row) => `${row.caseId} | ${row.what} | ${row.observed}`).join("\n"));
  await closeSessions();
});

test("E-P0-01a mauvais mot de passe: pas de session, message identique pour un e-mail existant ou inexistant", async ({ browser }) => {
  const known = await adminContext(browser);
  const unknown = await adminContext(browser);
  const wrong = await passwordStep(known, main.email, WRONG_PASSWORD);
  const ghost = await passwordStep(unknown, `inconnu.${uniqueSuffix()}@e2e.assurmatch.test`, WRONG_PASSWORD);
  observe("E-P0-01a", "compte existant", `${wrong.result.url.pathname}${wrong.result.url.search} | ${wrong.result.notices.join(" / ")}`);
  observe("E-P0-01a", "e-mail inexistant", `${ghost.result.url.pathname}${ghost.result.url.search} | ${ghost.result.notices.join(" / ")}`);
  // Fixed (lots 5 and 7): 401 INVALID_CREDENTIALS and a readable notice, identical for a known and an unknown e-mail.
  const apiKnown = await api(undefined, "POST", "/auth/login", { email: main.email, password: WRONG_PASSWORD });
  const apiGhost = await api(undefined, "POST", "/auth/login", { email: `inconnu.${uniqueSuffix()}@e2e.assurmatch.test`, password: WRONG_PASSWORD });
  observe("E-P0-01a", "API mauvais mot de passe (existant / inexistant)", `${apiKnown.status} ${apiKnown.text.slice(0, 100)} / ${apiGhost.status} ${apiGhost.text.slice(0, 100)}`);
  expect(apiKnown.status, apiKnown.text).toBe(401);
  expect(apiGhost.status, apiGhost.text).toBe(401);
  expect(rec(apiKnown.body).code).toBe("INVALID_CREDENTIALS");
  expect(rec(apiGhost.body).code).toBe("INVALID_CREDENTIALS");
  expect(wrong.result.notices, "readable message").toEqual(["Identifiants invalides."]);
  expect(wrong.result.url.searchParams.get("error")).toBe("invalid_credentials");
  expect(wrong.result.hasSession, "no session cookie after a wrong password").toBe(false);
  expect(ghost.result.hasSession).toBe(false);
  expect(wrong.result.url.searchParams.get("error"), "an error is signalled").toBeTruthy();
  expect(wrong.result.url.searchParams.get("error")).toBe(ghost.result.url.searchParams.get("error"));
  expect(wrong.result.notices, "same message for an existing and an unknown e-mail").toEqual(ghost.result.notices);
  expect(wrong.result.notices.join(" ")).not.toMatch(/n'existe|inconnu|introuvable|not found|unknown/iu);
  await wrong.page.goto(`${e2eEnv.adminUrl}/feature-flags`);
  expect(wrong.page.url()).toContain("/login?reason=session_required");
  await known.close();
  await unknown.close();
});

test("E-P0-01b mot de passe de 11 caracteres: bloque par le champ, 400 via l'API", async ({ browser }) => {
  const context = await adminContext(browser);
  const page = await context.newPage();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto(`${e2eEnv.adminUrl}/login`);
  await page.locator("#login-email").fill(main.email);
  await page.locator("#login-password").fill("Abcdefghij1");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForTimeout(1_500);
  const invalid = await page.locator("#login-password").evaluate((element) => (element as HTMLInputElement).matches(":invalid"));
  observe("E-P0-01b", "champ 11 caracteres", `pathname=${new URL(page.url()).pathname}, :invalid=${invalid}, POST emis=${posts.length}`);
  expect(invalid, "the minLength=12 constraint flags the field").toBe(true);
  expect(posts, "no request leaves the browser").toHaveLength(0);
  expect(new URL(page.url()).pathname).toBe("/login");
  await context.close();

  const direct = await api(undefined, "POST", "/auth/login", { email: main.email, password: "Abcdefghij1" });
  observe("E-P0-01b", "API POST /auth/login mot de passe 11 caracteres", `${direct.status} ${direct.text.slice(0, 160)}`);
  expect(direct.status).toBe(400);
});

test("E-P0-01d /mfa: mauvais code 000000, on reste sur /mfa, aucune session MFA", async ({ browser }) => {
  const context = await adminContext(browser);
  const { page, result } = await passwordStep(context, main.email, main.password);
  expect(result.url.pathname).toBe("/mfa");
  await page.locator("#mfa-code").fill("000000");
  await page.getByRole("button", { name: /Vérifier MFA/u }).click();
  await expect.poll(async () => (await noticeTexts(page)).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const texts = await noticeTexts(page);
  observe("E-P0-01d", "texte affiche apres 000000", texts.join(" / "));
  expect(new URL(page.url()).pathname, "stays on /mfa").toBe("/mfa");
  const token = await adminCookie(context);
  expect(token, "the password-only token exists but proves no second factor").toBeTruthy();
  const me = await api(token, "GET", "/auth/me");
  expect(rec(me.body).mfaVerified, "no MFA-verified session").not.toBe(true);
  await page.goto(`${e2eEnv.adminUrl}/feature-flags`);
  const afterUrl = new URL(page.url());
  observe("E-P0-01d", "ouverture de /feature-flags avec une session sans MFA", `${afterUrl.pathname}${afterUrl.search} | ${(await noticeTexts(page)).join(" / ") || "aucun avis affiche"}`);
  expect((await noticeTexts(page)).join(" "), "the redirection explains that a second factor is required").toMatch(/deux étapes|MFA|vérification/iu);
  expect(afterUrl.pathname).toBe("/login");
  await context.close();
});

test("E-P0-01f code de secours accepte une fois, refuse la seconde fois", async ({ browser }) => {
  const code = main.backupCodes[0] as string;
  const useBackup = async (): Promise<{ page: Page; left: boolean; texts: string[] }> => {
    const context = await adminContext(browser);
    const { page, result } = await passwordStep(context, main.email, main.password);
    expect(result.url.pathname).toBe("/mfa");
    await page.locator("#mfa-kind").selectOption("backup");
    await page.locator("#mfa-code").fill(code);
    await page.getByRole("button", { name: /Vérifier MFA/u }).click();
    await expect
      .poll(async () => !new URL(page.url()).pathname.startsWith("/mfa") || (await noticeTexts(page)).length > 0, { timeout: 25_000 })
      .toBe(true);
    const left = !new URL(page.url()).pathname.startsWith("/mfa");
    const texts = await noticeTexts(page);
    if (left) await context.close();
    else observe("E-P0-01f", "2e usage du code de secours", texts.join(" / "));
    return { page, left, texts };
  };
  const first = await useBackup();
  expect(first.left, "first use of a valid backup code is accepted").toBe(true);
  const second = await useBackup();
  expect(second.left, "second use of the same backup code is refused").toBe(false);
  expect(new URL(second.page.url()).pathname).toBe("/mfa");
  await second.page.context().close();
});

test("E-P0-01g session absente puis expiree: motifs de redirection et retour a la page demandee", async ({ browser }) => {
  const context = await adminContext(browser);
  const page = await context.newPage();
  await page.goto(`${e2eEnv.adminUrl}/feature-flags`);
  let url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("reason")).toBe("session_required");
  expect(url.searchParams.get("returnTo")).toBe("/feature-flags");
  await expect(page.getByText("Connectez-vous pour accéder à l'administration.")).toBeVisible();

  await context.addCookies([{ name: "assurmatch_admin_token", value: "forge.invalide.jeton", url: e2eEnv.adminUrl }]);
  await page.goto(`${e2eEnv.adminUrl}/feature-flags`);
  url = new URL(page.url());
  observe("E-P0-01g", "cookie falsifie", `${url.pathname}${url.search} | ${(await noticeTexts(page)).join(" / ")}`);
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("reason")).toBe("session_expired");
  expect(url.searchParams.get("returnTo")).toBe("/feature-flags");
  await expect(page.getByText("Votre session a expiré. Connectez-vous à nouveau.")).toBeVisible();

  await resilientLogin(page, superAdmin, "/feature-flags");
  await page.waitForURL((target) => target.pathname === "/feature-flags");
  expect(new URL(page.url()).pathname, "back on the requested page after login + MFA").toBe("/feature-flags");
  await context.close();
});

test("E-P0-01h un compte broker valide sur l'app admin: access_denied, aucune session admin", async ({ browser }) => {
  const owner = requireState(loadJourneyState(), "brokerOwner");
  const context = await adminContext(browser);
  const { page, result } = await passwordStep(context, owner.email, owner.password);
  observe("E-P0-01h", "apres le mot de passe", `${result.url.pathname}${result.url.search} | ${result.notices.join(" / ")}`);
  if (result.url.pathname.startsWith("/mfa")) {
    await page.locator("#mfa-code").fill(await currentCode(owner.totpSecret));
    await page.getByRole("button", { name: /Vérifier MFA/u }).click();
    await page.waitForURL((target) => !target.pathname.startsWith("/mfa"), { timeout: 30_000 });
  }
  const url = new URL(page.url());
  observe("E-P0-01h", "arrivee finale", `${url.pathname}${url.search} | ${(await noticeTexts(page)).join(" / ")}`);
  await page.goto(`${e2eEnv.adminUrl}/feature-flags`);
  const target = new URL(page.url());
  expect(target.pathname, "no admin screen opens").toBe("/login");
  expect(target.searchParams.get("error")).toBe("access_denied");
  const token = await adminCookie(context);
  if (token) {
    const probe = await api(token, "GET", "/admin/users?page=1&pageSize=1");
    observe("E-P0-01h", "API /admin/users avec le jeton du courtier", `${probe.status} ${probe.text.slice(0, 300)}`);
    expect(probe.text).not.toMatch(/passwordHash|mfaSecretEncrypted|mfaBackupCodesHashes|passwordResetTokenHash/u);
    for (const path of ["/admin/feature-flags", "/admin/audit-logs", "/admin/operations/audit-logs?pageSize=1", "/admin/partners"]) {
      const other = await api(token, "GET", path);
      observe("E-P0-01h", `API ${path} avec le jeton du courtier`, `${other.status} ${other.text.slice(0, 160)}`);
      expect([401, 403], `${path}: ${other.text.slice(0, 120)}`).toContain(other.status);
    }
    // H-B (retained): a broker token no longer reads /admin/users (the team list stays on /broker/team) and never sees secrets.
    const wide = await api(token, "GET", "/admin/users?page=1&pageSize=100");
    observe("E-P0-01h", "GET /admin/users avec un jeton courtier", `${wide.status} ${wide.text.slice(0, 120)}`);
    expect([401, 403], wide.text).toContain(wide.status);
    expect(wide.text).not.toMatch(/passwordHash|mfaSecretEncrypted|mfaBackupCodesHashes|passwordResetTokenHash/u);
    expect(rec(wide.body).code).toBe("RBAC_DENIED");
    const flags = await api(token, "GET", "/admin/feature-flags");
    expect([401, 403]).toContain(flags.status);
    const partners = await api(token, "GET", "/admin/partners");
    expect([401, 403]).toContain(partners.status);
  }
  await context.close();
});

test("Verrouillage admin: 5 echecs -> locked, le bon mot de passe est refuse, deblocage par le Super Admin", async ({ browser }) => {
  const statuses: string[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await api(undefined, "POST", "/auth/login", { email: lock.email, password: `${WRONG_PASSWORD}${attempt}` });
    statuses.push(`${result.status}`);
    expect(result.status, result.text).toBe(401);
    expect(rec(result.body).code).toBe("INVALID_CREDENTIALS");
  }
  observe("Verrouillage", "statuts des 5 echecs", statuses.join(","));
  const token = await saToken();
  const userId = await userIdByEmail(token, lock.email);
  const detail = await api(token, "GET", `/admin/users/${userId}`);
  observe("Verrouillage", "compte apres 5 echecs", `status=${String(rec(detail.body).status)} failedLoginCount=${String(rec(detail.body).failedLoginCount)}`);
  expect(rec(detail.body).status).toBe("locked");

  const direct = await api(undefined, "POST", "/auth/login", { email: lock.email, password: lock.password });
  observe("Verrouillage", "bon mot de passe via l'API", `${direct.status} ${direct.text.slice(0, 120)}`);
  // H-C (retained): anti-enumeration, the locked account answers like a wrong password (401 INVALID_CREDENTIALS), no "Compte verrouillé" notice.
  expect(direct.status, direct.text).toBe(401);
  expect(rec(direct.body).code).toBe("INVALID_CREDENTIALS");

  const context = await adminContext(browser);
  const { result, page } = await passwordStep(context, lock.email, lock.password);
  const lockedNotice = result.notices.some((text) => /Compte verrouill/u.test(text));
  observe("Verrouillage", "bon mot de passe via l'ecran", `${result.url.pathname}${result.url.search} | ${result.notices.join(" / ")} | avis "Compte verrouille" affiche=${lockedNotice}`);
  expect(result.hasSession).toBe(false);
  expect(result.url.searchParams.get("error")).toBe("invalid_credentials");
  expect(result.notices).toEqual(["Identifiants invalides."]);
  expect(lockedNotice, "no account-locked notice (anti-enumeration)").toBe(false);
  await context.close();

  // Unlock through /users/[userId] (restorative action, plain form).
  await openAs(saPage, superAdmin, `/users/${userId}?tab=actions`);
  await saPage.locator("#user-reason-unlock").fill(EDGE_REASON);
  await saPage.getByRole("button", { name: "Confirmer unlock", exact: true }).click();
  await saPage.waitForURL(/notice=unlock/u);
  const after = await api(await saToken(), "GET", `/admin/users/${userId}`);
  observe("Verrouillage", "compte apres deblocage", `status=${String(rec(after.body).status)} failedLoginCount=${String(rec(after.body).failedLoginCount)}`);
  expect(rec(after.body).status).toBe("active");

  const again = await adminContext(browser);
  const page2 = await again.newPage();
  await login(page2, lock, "/");
  expect(new URL(page2.url()).pathname, "the unlocked account logs in again").not.toMatch(/^\/(login|mfa)/u);
  void page;
  await again.close();
});

test("Compte suspendu: statut et texte de la connexion, puis reactivation", async ({ browser }) => {
  const token = await saToken();
  const userId = await userIdByEmail(token, susp.email);
  await openAs(saPage, superAdmin, `/users/${userId}?tab=actions`);
  await saPage.getByRole("button", { name: "Confirmer suspend", exact: true }).first().click();
  const dialog = saPage.locator("dialog[open], [role='dialog']").first();
  await dialog.locator("#user-reason-suspend").fill(EDGE_REASON);
  await dialog.getByRole("button", { name: "Confirmer suspend", exact: true }).click();
  await saPage.waitForURL(/notice=suspend/u);

  try {
    const direct = await api(undefined, "POST", "/auth/login", { email: susp.email, password: susp.password });
    observe("Suspendu", "API POST /auth/login", `${direct.status} ${direct.text.slice(0, 200)}`);
    // H-C: 403 ACCOUNT_SUSPENDED only after the correct password (never a 500).
    expect(direct.status, "a suspended account never gets a token (and never a 5xx)").toBe(403);
    expect(rec(direct.body).code).toBe("ACCOUNT_SUSPENDED");
    const wrongPw = await api(undefined, "POST", "/auth/login", { email: susp.email, password: WRONG_PASSWORD });
    observe("Suspendu", "API mauvais mot de passe sur compte suspendu", `${wrongPw.status} ${wrongPw.text.slice(0, 120)}`);
    expect(wrongPw.status, "the suspension is not revealed without the right password").toBe(401);
    expect(rec(wrongPw.body).code).toBe("INVALID_CREDENTIALS");
    const context = await adminContext(browser);
    const { result } = await passwordStep(context, susp.email, susp.password);
    observe("Suspendu", "ecran de connexion", `${result.url.pathname}${result.url.search} | ${result.notices.join(" / ")}`);
    expect(result.hasSession).toBe(false);
    expect(result.url.searchParams.get("error")).toBeTruthy();
    expect(classifyText(result.notices.join(" ")), "readable notice").toMatch(/^\(c\)/u);
    await context.close();
  } finally {
    await openAs(saPage, superAdmin, `/users/${userId}?tab=actions`);
    await saPage.locator("#user-reason-unsuspend").fill(EDGE_REASON);
    await saPage.getByRole("button", { name: "Confirmer unsuspend", exact: true }).click();
    await saPage.waitForURL(/notice=unsuspend/u);
  }
  const after = await api(await saToken(), "GET", `/admin/users/${userId}`);
  expect(rec(after.body).status).toBe("active");
  const again = await adminContext(browser);
  const page = await again.newPage();
  await login(page, susp, "/");
  expect(new URL(page.url()).pathname).not.toMatch(/^\/(login|mfa)/u);
  await again.close();
});

test("T-09 messages d'authentification reellement affiches (admin)", async ({ browser }) => {
  const token = new URL(invite.link).searchParams.get("token") as string;
  const flipped = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  const context = await adminContext(browser);
  const rows: Array<{ cas: string; ecran: string; api: string; classe: string }> = [];

  const probe = async (cas: string, tok: string, pw: string, expected: { status: number; codes: string[] }) => {
    const ui = await submitActivation(context, tok, pw);
    const direct = await api(undefined, "POST", "/auth/activate", { token: tok, password: pw });
    const ecran = `${ui.url.pathname} | ${ui.notices.join(" / ")}`;
    rows.push({ cas, ecran, api: `${direct.status} ${direct.text.slice(0, 100)}`, classe: classifyText(ui.notices.join(" ")) });
    expect(ui.hasSession, `${cas}: no session`).toBe(false);
    expect(ui.url.pathname, `${cas}: no MFA step`).not.toMatch(/^\/mfa/u);
    expect(direct.status, `${cas}: API refuses (${direct.text.slice(0, 120)})`).toBe(expected.status);
    expect(expected.codes, `${cas}: error code ${String(rec(direct.body).code)}`).toContain(String(rec(direct.body).code));
    expect(classifyText(ui.notices.join(" ")), `${cas}: readable notice (${ui.notices.join(" / ")})`).toMatch(/^\(c\)/u);
    await ui.page.close();
    return { ui, direct };
  };

  const forged = await probe("jeton falsifie (aleatoire) + mot de passe valide", `forge-${uniqueSuffix()}-${"x".repeat(40)}`, GOOD_NEW_PASSWORD, INVALID_TOKEN);
  const tampered = await probe("jeton valide modifie d'un caractere", flipped, GOOD_NEW_PASSWORD, INVALID_TOKEN);
  await probe("jeton mal forme (caracteres speciaux)", "!!!\"><img src=x onerror=alert(1)>", GOOD_NEW_PASSWORD, INVALID_TOKEN);
  await probe("jeton mal forme (3000 caracteres)", "a".repeat(3000), GOOD_NEW_PASSWORD, INVALID_TOKEN);
  await probe("mot de passe de la liste noire (assurmatch123), jeton valide", token, "assurmatch123", PASSWORD_POLICY);
  await probe("mot de passe egal a l'e-mail, jeton valide", token, invite.email, PASSWORD_POLICY);

  // The two refusals above must not have consumed the token: a good password still activates the account.
  const good = await submitActivation(await adminContext(browser), token, GOOD_NEW_PASSWORD);
  rows.push({ cas: "jeton valide + bon mot de passe (apres 2 refus)", ecran: `${good.url.pathname} | ${good.notices.join(" / ")}`, api: "-", classe: "-" });
  expect(good.url.pathname, "token still valid after the refused passwords").toMatch(/^\/mfa/u);
  expect(good.hasSession).toBe(true);
  await good.page.context().close();

  const reusedContext = await adminContext(browser);
  const reusedUi = await submitActivation(reusedContext, token, GOOD_NEW_PASSWORD);
  const reusedApi = await api(undefined, "POST", "/auth/activate", { token, password: GOOD_NEW_PASSWORD });
  rows.push({
    cas: "jeton deja utilise",
    ecran: `${reusedUi.url.pathname} | ${reusedUi.notices.join(" / ")} | session=${reusedUi.hasSession}`,
    api: `${reusedApi.status} ${reusedApi.text.slice(0, 100)}`,
    classe: classifyText(reusedUi.notices.join(" "))
  });
  await reusedContext.close();
  // One-shot token (lot 5): refused once consumed, same neutral answer as a forged token.
  expect(reusedUi.hasSession, "a consumed activation token opens no session").toBe(false);
  expect(reusedApi.status, reusedApi.text).toBe(400);
  expect(rec(reusedApi.body).code).toBe("INVALID_TOKEN");
  expect(reusedUi.notices, "used token and tampered token are refused without distinction").toEqual(tampered.ui.notices);

  const resetContext = await adminContext(browser);
  const resetPage = await resetContext.newPage();
  await resetPage.goto(`${e2eEnv.adminUrl}/password-reset?token=${encodeURIComponent(`invalide-${uniqueSuffix()}`)}`);
  await resetPage.locator("#password-reset-new").fill(GOOD_NEW_PASSWORD);
  await resetPage.getByRole("button", { name: "Consommer le jeton" }).click();
  await expect.poll(async () => (await noticeTexts(resetPage)).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const resetTexts = await noticeTexts(resetPage);
  const resetApi = await api(undefined, "POST", "/auth/password-reset", { token: `invalide-${uniqueSuffix()}`, newPassword: GOOD_NEW_PASSWORD });
  rows.push({ cas: "/password-reset?token= invalide", ecran: `${new URL(resetPage.url()).pathname} | ${resetTexts.join(" / ")}`, api: `${resetApi.status} ${resetApi.text.slice(0, 100)}`, classe: classifyText(resetTexts.join(" ")) });
  expect(resetTexts.join(" ")).not.toMatch(/réinitialisé/u);
  expect(await adminCookie(resetContext)).toBeUndefined();
  await resetContext.close();
  await context.close();

  console.table(rows);
  for (const row of rows) observe("T-09", row.cas, `ecran=[${row.ecran}] api=[${row.api}] classe=${row.classe}`);
  expect(forged.ui.notices, "forged and tampered tokens are refused without distinction").toEqual(tampered.ui.notices);
  const raw = rows.filter((row) => row.classe.startsWith("(a)"));
  expect(raw.map((row) => row.ecran), "no raw technical message is shown to the user").toEqual([]);
  expect(resetApi.status, resetApi.text).toBe(400);
  expect(rec(resetApi.body).code).toBe("INVALID_TOKEN");
});

test("T-01 (partie auth) les actions d'authentification sont journalisees pour les comptes jetables", async () => {
  const token = await saToken();
  const mainId = await userIdByEmail(token, main.email);
  const lockId = await userIdByEmail(token, lock.email);
  const suspId = await userIdByEmail(token, susp.email);

  const actionsOf = async (targetId: string) => {
    const result = await api(token, "GET", `/admin/operations/audit-logs?targetId=${encodeURIComponent(targetId)}&pageSize=100`);
    expect(result.status, `audit-logs -> ${result.text.slice(0, 160)}`).toBe(200);
    return itemsOfBody(result.body);
  };
  const has = (rows: Array<Record<string, unknown>>, action: string, result?: string) =>
    rows.some((row) => row.action === action && (result === undefined || row.result === result));

  await expect
    .poll(async () => {
      const rows = await actionsOf(mainId);
      return has(rows, "user.login_failed", "refused") && has(rows, "user.mfa_failed", "refused") && has(rows, "user.mfa_verified", "success");
    }, { timeout: 30_000 })
    .toBe(true);
  const mainRows = await actionsOf(mainId);
  const lockRows = await actionsOf(lockId);
  const suspRows = await actionsOf(suspId);
  observe("T-01", "actions du compte principal", [...new Set(mainRows.map((row) => `${String(row.action)}:${String(row.result)}`))].join(", "));
  observe("T-01", "actions du compte verrouille", [...new Set(lockRows.map((row) => `${String(row.action)}:${String(row.result)}`))].join(", "));
  observe("T-01", "actions du compte suspendu", [...new Set(suspRows.map((row) => `${String(row.action)}:${String(row.result)}`))].join(", "));

  expect(lockRows.filter((row) => row.action === "user.login_failed" && row.result === "refused").length).toBeGreaterThanOrEqual(5);
  expect(has(lockRows, "user.locked_after_failed_logins", "success")).toBe(true);
  expect(has(lockRows, "user.unlocked")).toBe(true);
  expect(has(suspRows, "user.login_refused_suspended", "refused")).toBe(true);
  expect(has(suspRows, "user.suspended")).toBe(true);
  expect(has(suspRows, "user.unsuspended")).toBe(true);
  const unlock = lockRows.find((row) => row.action === "user.unlocked");
  observe("T-01", "acteur du deblocage", `actorId=${String(unlock?.actorId)} (Super Admin attendu)`);
  expect(String(unlock?.actorId ?? ""), "unlock is attributed to the Super Admin").not.toBe("");
  const failed = lockRows.find((row) => row.action === "user.login_failed");
  observe("T-01", "acteur d'un echec de connexion", `actorId=${String(failed?.actorId ?? "null (systeme / visiteur)")}`);

  // The same events are readable on the screen.
  await openAs(saPage, superAdmin, `/compliance/audit-logs?targetId=${encodeURIComponent(lockId)}`);
  await expect(saPage.getByText("user.locked_after_failed_logins").first()).toBeVisible();
});

test("T-09b jeton de reinitialisation: usage unique, la suspension survit a une reinitialisation", async () => {
  const token = await saToken();
  const userId = await userIdByEmail(token, susp.email);
  const issue = async (): Promise<string> => {
    const before = await messageIdsTo(susp.email);
    const issued = await api(token, "POST", `/admin/users/${userId}/password-reset`, { reason: EDGE_REASON });
    expect(issued.status, issued.text).toBeLessThan(300);
    const mail = await waitForMail({ to: susp.email, body: /password-reset[?]token=/u, exclude: before });
    return new URL(extractLink(mail, /password-reset[?]token=/u)).searchParams.get("token") as string;
  };
  const newPassword = `E2e-Rst-${Math.random().toString(36).slice(2, 10)}-Pw!7`;

  // 1. a token issued, then the account is suspended: the reset is accepted (H-I: a reset is not an unlock) but the suspension is kept.
  const first = await issue();
  expect((await api(token, "POST", `/admin/users/${userId}/suspend`, { reason: EDGE_REASON })).status).toBeLessThan(300);
  try {
    const consumed = await api(undefined, "POST", "/auth/password-reset", { token: first, newPassword });
    observe("T-09b", "jeton de reinitialisation, compte suspendu", `${consumed.status} ${consumed.text.slice(0, 100)}`);
    expect(consumed.status, consumed.text).toBeLessThan(300);
    const login = await api(undefined, "POST", "/auth/login", { email: susp.email, password: newPassword });
    observe("T-09b", "connexion avec le nouveau mot de passe, compte toujours suspendu", `${login.status} ${login.text.slice(0, 100)}`);
    expect(login.status, "the reset does not lift a suspension").toBe(403);
    expect(rec(login.body).code).toBe("ACCOUNT_SUSPENDED");
    const reused = await api(undefined, "POST", "/auth/password-reset", { token: first, newPassword: `${newPassword}y` });
    expect(reused.status, "the token is consumed even on a suspended account").toBe(400);
    expect(rec(reused.body).code).toBe("INVALID_TOKEN");
  } finally {
    expect((await api(token, "POST", `/admin/users/${userId}/unsuspend`, { reason: EDGE_REASON })).status).toBeLessThan(300);
  }

  // 2. a fresh token works once, then is refused.
  const second = await issue();
  const used = await api(undefined, "POST", "/auth/password-reset", { token: second, newPassword });
  observe("T-09b", "jeton de reinitialisation, 1er usage", `${used.status} ${used.text.slice(0, 100)}`);
  expect(used.status, used.text).toBeLessThan(300);
  const again = await api(undefined, "POST", "/auth/password-reset", { token: second, newPassword: `${newPassword}x` });
  observe("T-09b", "jeton de reinitialisation, 2e usage", `${again.status} ${again.text.slice(0, 100)}`);
  expect(again.status, again.text).toBe(400);
  expect(rec(again.body).code).toBe("INVALID_TOKEN");
});

test("E-P0-01e rejeu d'un code TOTP deja accepte dans la meme fenetre de 30 s: refuse (H4 corrige)", async () => {
  const first = await api(undefined, "POST", "/auth/login", { email: main.email, password: main.password });
  expect(first.status, `login 1 -> ${first.text.slice(0, 120)}`).toBeLessThan(300);
  const second = await api(undefined, "POST", "/auth/login", { email: main.email, password: main.password });
  expect(second.status).toBeLessThan(300);
  const code = await currentCode(main.totpSecret);
  const accepted = await api(String(rec(first.body).accessToken), "POST", "/auth/mfa/verify", { code, kind: "totp" });
  expect(accepted.status, `first use of the code -> ${accepted.text.slice(0, 120)}`).toBeLessThan(300);
  const replay = await api(String(rec(second.body).accessToken), "POST", "/auth/mfa/verify", { code, kind: "totp" });
  observe("E-P0-01e", "rejeu du meme code TOTP (nouvelle connexion)", `${replay.status} ${replay.text.slice(0, 120)}`);
  expect(replay.status, "a TOTP code that was already accepted must be refused").toBeGreaterThanOrEqual(400);
  expect(replay.status).toBeLessThan(500);
});

});
