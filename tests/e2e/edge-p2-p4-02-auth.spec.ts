import { expect, test, type Page } from "@playwright/test";
import { e2ePassword, freshTotp, login, verifyTotp } from "./support/backoffice";
import {
  AUTH_LABEL,
  BROKER_TOKEN_COOKIE,
  activateAndEnrol,
  adminIssueToken,
  adminUnlock,
  alteredToken,
  apiLogin,
  authBucketSnapshot,
  authMessages,
  authMessagesTable,
  brokerPage,
  brokerSessionCookie,
  closeAdminPage,
  expireActivationToken,
  inviteAgents,
  noticeTexts,
  provisionAuthFirm,
  recordMessage,
  refusalSignature,
  shownSecret,
  submitActivation,
  submitLogin,
  submitMfaCode,
  trustedDeviceRows,
  userRow,
  waitForAuthBudget,
  withToken,
  wrongCode,
  type AuthFirm,
  type Invitee,
  type ScreenOutcome
} from "./support/edge-p2p4-auth";
import { e2eEnv } from "./support/env";
import { apiCall, asRecord } from "./support/pro-roles";
import { totp } from "./support/totp";

// Lot 3 - edge cases of phase 2 (scenario e2e-parcours-complet.md section 7): authentication and session of the
// broker back-office. Own throwaway Pro firm "E2E Courtage L3-<timestamp>" and own agents (invited from /team,
// activation links NOT consumed until a case needs them). Nothing touches the base journey, the Super Admin or
// the Compliance Admin beyond reading their credentials; the Super Admin only opens the pages of the spec's own
// accounts (reset token, unlock). No rate limit is tested: a read-only guard waits when the shared IP buckets
// are busy. State lives in memory (serial mode), never in journey-state.json.
//
//   E-P2-01a/b/c  activation password: 11 characters, e-mail / display name / deny-list, `aaaaaaaaaaaa`
//   E-P2-02d      double "Générer secret", re-enrolment 403 MFA_REQUIRED (chained on the account of 01c)
//   E-P2-01d/e    expired token (+ re-issue by the admin), used token, altered token
//   E-P2-02a/b    wrong / short TOTP code, replay of an accepted code (UI and API)
//   E-P2-02c      lockout after 5 shared failures, refusal text, unlock by the admin
//   E-P2-03a      session absent / expired, return to the requested page, form action without a session
//   E-P2-03b      password reset token (once), password change (wrong then right), trusted devices revoked
//   T-05, T-09    injection strings in the login e-mail, table of every authentication message shown

test.describe.configure({ mode: "serial" });

type Key = "rules" | "expired" | "used" | "altered" | "lock" | "pwd";

let firm: AuthFirm;
const members = {} as Record<Key, Invitee>;

const STRONG = (label: string) => e2ePassword(label);

function member(key: Key): Invitee {
  const found = members[key];
  if (!found) throw new Error(`member ${key} not provisioned`);
  return found;
}

function constat(description: string): void {
  console.log(`[CONSTAT] ${description}`);
  test.info().annotations.push({ type: "constat", description });
}

const text = (outcome: ScreenOutcome) => outcome.notices.join(" / ") || "(aucun avis)";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  await waitForAuthBudget({ login: 4, mfa: 3 });
  firm = await provisionAuthFirm(browser);
  const invitees = await inviteAgents(firm.ownerPage, ["rules", "expired", "used", "altered", "lock", "pwd"]);
  for (const invitee of invitees) members[invitee.key as Key] = invitee;
  await firm.ownerPage.context().close();
  console.log(`[L3-AUTH] firm ${AUTH_LABEL} (${firm.partnerId}); ${authBucketSnapshot()}`);
});

test.afterAll(async () => {
  await closeAdminPage();
});

// ---------------------------------------------------------------------------------------------
// E-P2-01 activation password rules (account "rules")
// ---------------------------------------------------------------------------------------------

test("E-P2-01a mot de passe de 11 caractères : bloqué par le champ (minLength 12), l'API répond 400", async ({ browser }) => {
  const target = member("rules");
  const page = await brokerPage(browser);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts += 1;
  });
  await page.goto(target.link);
  await expect(page.getByText("12 caractères minimum.")).toBeVisible();
  const password = page.locator("#activate-password");
  await expect(password).toHaveAttribute("minlength", "12");
  await password.fill("Aa1!Aa1!Aa1");
  await page.getByRole("button", { name: /Activer/u }).click();
  await page.waitForTimeout(800);
  const message = await password.evaluate((element) => (element as HTMLInputElement).validationMessage);
  recordMessage("E-P2-01a", "activation, mot de passe de 11 caractères (message du navigateur)", message || "(aucun)");
  expect(await password.evaluate((element) => (element as HTMLInputElement).validity.tooShort), "native too-short validation").toBe(true);
  expect(new URL(page.url()).pathname, "still on the activation screen").toBe("/activate");
  expect(posts, "no request is sent by the blocked form").toBe(0);
  expect(await brokerSessionCookie(page), "no session").toBeUndefined();

  const api = await apiCall(undefined, "POST", "/auth/activate", { token: target.token, password: "Aa1!Aa1!Aa1" });
  recordMessage("E-P2-01a", "API POST /auth/activate, mot de passe de 11 caractères", refusalSignature(api), `HTTP ${api.status}`);
  expect(api.status).toBe(400);
  await page.context().close();
});

test("E-P2-01b mot de passe = e-mail / nom affiché / liste noire (assurmatch123) : activation refusée, jeton non consommé, texte réel consigné (H13)", async ({ browser }) => {
  const target = member("rules");
  const page = await brokerPage(browser);
  const cases: Array<{ label: string; password: string }> = [
    { label: "mot de passe identique à l'e-mail", password: target.email },
    { label: "mot de passe identique au nom affiché", password: target.displayName },
    { label: "mot de passe de la liste noire (assurmatch123)", password: "assurmatch123" }
  ];
  expect(target.email.length, "e-mail long enough to be a valid password").toBeGreaterThanOrEqual(12);
  expect(target.displayName.length, "display name long enough to be a valid password").toBeGreaterThanOrEqual(12);
  const seen: string[] = [];
  for (const entry of cases) {
    const outcome = await submitActivation(page, target.link, entry.password);
    recordMessage("E-P2-01b", `activation, ${entry.label}`, text(outcome), `${outcome.path}${outcome.search}`);
    seen.push(`${entry.label}: « ${text(outcome)} »`);
    expect(outcome.path, `${entry.label}: stays on the activation screen`).toBe("/activate");
    expect(outcome.hasSession, `${entry.label}: no session cookie`).toBe(false);
    expect(text(outcome), `${entry.label}: observed raw text (H13)`).toBe("api_500");
    const api = await apiCall(undefined, "POST", "/auth/activate", { token: target.token, password: entry.password });
    recordMessage("E-P2-01b", `API POST /auth/activate, ${entry.label}`, refusalSignature(api), `HTTP ${api.status}`);
    seen.push(`API ${api.status} ${refusalSignature(api)}`);
    expect(api.status, `${entry.label}: observed HTTP status of the policy refusal (H13)`).toBe(500);
  }
  constat(`H13 : le refus de la politique de mot de passe sort en HTTP 500 INTERNAL_ERROR (Error simple non classé par statusForError, backend/src/modules/common/filters/error-response.filter.ts:125-130 ; message masqué car il contient « password ») et l'écran affiche le texte brut « api_500 » (auth-flow-actions.ts:27-56). Refus, aucune session, jeton non consommé. ${seen.join(" | ")}`);
  // The token is still unconsumed: the account is still waiting for its activation.
  expect(userRow(target.email).hasToken, "activation token not consumed by the refusals").toBe(true);
  await page.context().close();
});

test("E-P2-01c mot de passe aaaaaaaaaaaa (12 caractères sans complexité) accepté : constat H3", async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  const target = member("rules");
  const page = await brokerPage(browser);
  const outcome = await submitActivation(page, target.link, "aaaaaaaaaaaa");
  recordMessage("E-P2-01c", "activation avec aaaaaaaaaaaa", `${outcome.path}${outcome.search}`, outcome.hasSession ? "session posée" : "pas de session");
  expect(outcome.path, "accepted: the flow moves on to the MFA screen").toBe("/mfa");
  expect(outcome.hasSession, "activation opens a (password-only) session").toBe(true);
  constat("H3 : `aaaaaaaaaaaa` est accepté (aucune règle de complexité au-delà de 12 caractères, de l'e-mail, du nom affiché et d'une liste de 12 mots de passe) : password-policy.service.ts:10-15");
  held = { page, password: "aaaaaaaaaaaa" };
});

let held: { page: Page; password: string } | undefined;

test("E-P2-02d double « Générer secret » : le nouveau remplace l'ancien ; une fois confirmé, ré-enrôlement 403 MFA_REQUIRED sans session MFA", async () => {
  test.setTimeout(4 * 60_000);
  await waitForAuthBudget({ login: 2, mfa: 3 });
  const target = member("rules");
  if (!held) throw new Error("E-P2-01c did not leave the pre-MFA page");
  const page = held.page;
  await expect(page).toHaveURL(/\/mfa/u);
  const generate = page.getByRole("button", { name: /G[ée]n[ée]rer secret/u });
  await generate.click();
  const first = await shownSecret(page);
  await generate.click();
  await expect.poll(async () => shownSecret(page), { timeout: 20_000, message: "second secret replaces the first" }).not.toBe(first);
  const second = await shownSecret(page);
  expect(second).not.toBe(first);
  await expect(page.locator("ul code")).toHaveCount(8);

  // The old secret no longer works...
  const stale = await submitMfaCode(page, await freshTotp(first));
  recordMessage("E-P2-02d", "code TOTP de l'ANCIEN secret", text(stale), `${stale.path}`);
  expect(stale.path, "the old secret is refused").toBe("/mfa");
  expect(stale.notices.length, "a refusal is shown").toBeGreaterThan(0);
  // ... the new one does.
  await verifyTotp(page, second);
  expect(new URL(page.url()).pathname.startsWith("/mfa"), "new secret verified").toBe(false);
  expect(userRow(target.email).mfaStatus).toBe("verified");

  // After confirmation a password-only session cannot enrol again.
  const session = await apiLogin(target.email, held.password);
  expect(session.mfaRequired, "password alone never proves the second factor").toBe(true);
  const enroll = await apiCall(session.accessToken, "POST", "/auth/mfa/enroll");
  recordMessage("E-P2-02d", "ré-enrôlement avec une session sans MFA (API)", refusalSignature(enroll), `HTTP ${enroll.status}`);
  expect(enroll.status).toBe(403);
  expect(enroll.text).toContain("MFA_REQUIRED");
  expect(enroll.text, "the confirmed secret is never returned").not.toContain(second);
  await page.context().close();
  held = undefined;
});

// ---------------------------------------------------------------------------------------------
// E-P2-01d / 01e expired, used and altered activation tokens
// ---------------------------------------------------------------------------------------------

test("E-P2-01d jeton d'activation expiré (30 min) : activation refusée, aucune session, message réel ; réémission par l'admin", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await waitForAuthBudget({ login: 2, mfa: 2 });
  const target = member("expired");
  const changed = expireActivationToken(target.email);
  expect(changed, "the activation token of the spec's own account was aged (SQL)").toBe(1);

  const page = await brokerPage(browser);
  const strong = STRONG("l3-exp");
  const outcome = await submitActivation(page, target.link, strong);
  recordMessage("E-P2-01d", "activation avec un jeton expiré", text(outcome), `${outcome.path}${outcome.search}`);
  expect(outcome.path).toBe("/activate");
  expect(outcome.hasSession, "no session after an expired token").toBe(false);
  expect(outcome.notices.length).toBeGreaterThan(0);
  const api = await apiCall(undefined, "POST", "/auth/activate", { token: target.token, password: strong });
  recordMessage("E-P2-01d", "API POST /auth/activate avec un jeton expiré", refusalSignature(api), `HTTP ${api.status}`);
  expect(api.status).toBeLessThan(500);
  expect(api.status).toBeGreaterThanOrEqual(400);

  // Re-issue by the Super Admin ("Réinitialisation mot de passe" > "Émettre un jeton"), then the owner of the account activates.
  const fresh = await adminIssueToken(browser, userRow(target.email).id, target.email);
  expect(fresh).not.toBe(target.token);
  const retry = await submitActivation(page, `${e2eEnv.brokerUrl}/activate?token=${encodeURIComponent(fresh)}`, strong);
  recordMessage("E-P2-01d", "activation avec le jeton réémis par l'admin", `${retry.path}`, retry.hasSession ? "session posée" : "pas de session");
  expect(retry.path, "the re-issued token activates the account").toBe("/mfa");
  expect(retry.hasSession).toBe(true);
  await page.context().close();
});

test("E-P2-01e jeton altéré d'un caractère : même refus qu'un jeton inconnu, aucune distinction, le jeton légitime reste valable", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await waitForAuthBudget({ login: 0, mfa: 2 });
  const used = member("used");
  const altered = member("altered");
  const usedPassword = STRONG("l3-used");
  usedPasswordHolder.password = usedPassword;
  // Consume the link of "used" (password + MFA enrolment); the same account serves the MFA cases below.
  const first = await brokerPage(browser);
  usedPasswordHolder.secret = await activateAndEnrol(first, used.link, usedPassword);
  await first.context().close();

  const second = await brokerPage(browser);
  const badToken = alteredToken(altered.token);
  const tampered = await submitActivation(second, withToken(altered.link, badToken), STRONG("l3-alt"));
  recordMessage("E-P2-01e", "activation avec un jeton altéré d'un caractère", text(tampered), `${tampered.path}${tampered.search}`);
  expect(tampered.hasSession).toBe(false);
  expect(tampered.path).toBe("/activate");
  const garbage = await submitActivation(second, withToken(altered.link, "jeton-inconnu-lot3"), STRONG("l3-garb"));
  recordMessage("E-P2-01e", "activation avec un jeton inconnu", text(garbage), `${garbage.path}${garbage.search}`);
  expect(text(tampered), "altered and unknown tokens: same screen").toBe(text(garbage));

  const probe = STRONG("l3-probe");
  const apiAltered = await apiCall(undefined, "POST", "/auth/activate", { token: badToken, password: probe });
  const apiGarbage = await apiCall(undefined, "POST", "/auth/activate", { token: "jeton-inconnu-lot3", password: probe });
  recordMessage("E-P2-01e", "API jeton altéré / inconnu", `${refusalSignature(apiAltered)} || ${refusalSignature(apiGarbage)}`);
  expect(refusalSignature(apiGarbage), "unknown token gets the same API refusal as an altered one").toBe(refusalSignature(apiAltered));
  expect(apiAltered.status).toBeGreaterThanOrEqual(400);
  expect(apiAltered.status).toBeLessThan(500);

  // The altered attempt did not consume the genuine token of the account.
  expect(userRow(altered.email).hasToken).toBe(true);
  const genuine = await submitActivation(second, altered.link, STRONG("l3-genuine"));
  expect(genuine.path, "the genuine link still activates the account").toBe("/mfa");
  await second.context().close();
});

test("E-P2-01e (jeton utilisé) rouvrir le lien d'activation déjà utilisé est refusé, comme un jeton altéré", async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  test.fail(true, "ANOMALIE L3A-03 : un jeton d'activation (ou de réinitialisation) déjà consommé reste valable jusqu'à son expiration (30 min) et se rejoue autant de fois qu'on veut (HTTP 201 + session). Cause : activateWithPassword / consumePasswordReset font `delete user.passwordResetTokenHash`, mais UsersRepository.toPrisma (backend/src/modules/users/users.repository.ts:245-246) renvoie `undefined`, que Prisma ignore : la colonne n'est jamais effacée (SELECT : passwordResetTokenHash reste renseigné après l'activation).");
  const used = member("used");
  // Same password as the account's: the replay (if accepted) must not change what the next cases rely on.
  const reuse = await submitActivation(await brokerPage(browser), used.link, usedPasswordHolder.password);
  recordMessage("E-P2-01e", "activation avec un jeton DÉJÀ UTILISÉ", reuse.path.startsWith("/mfa") ? "ACCEPTÉ (redirection /mfa, session posée)" : text(reuse), `${reuse.path}${reuse.search}`);
  const api = await apiCall(undefined, "POST", "/auth/activate", { token: used.token, password: usedPasswordHolder.password });
  recordMessage("E-P2-01e", "API POST /auth/activate avec un jeton DÉJÀ UTILISÉ", `HTTP ${api.status}`, userRow(used.email).hasToken ? "hash du jeton toujours en base après usage" : "hash effacé");
  expect(reuse.hasSession, "a used token opens no session").toBe(false);
  expect(reuse.path).toBe("/activate");
  expect(api.status, "API refuses a used token").toBeGreaterThanOrEqual(400);
});

const usedPasswordHolder: { password: string; secret: string } = { password: "", secret: "" };

// ---------------------------------------------------------------------------------------------
// E-P2-02a / 02b TOTP wrong / short code, replay (account "used", enrolled and verified)
// ---------------------------------------------------------------------------------------------

let mfaPage: Page | undefined;

test("E-P2-02a code TOTP erroné et code de moins de 6 caractères : on reste sur /mfa, le code court est bloqué par le champ", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  await waitForAuthBudget({ login: 3, mfa: 5 });
  const account = member("used");
  const { password, secret } = usedPasswordHolder;
  const page = await brokerPage(browser);
  const step = await submitLogin(page, account.email, password);
  expect(step.path, "password alone leads to the MFA screen").toBe("/mfa");
  await expect(page.locator("#mfa-code")).toHaveAttribute("minlength", "6");

  const now = Date.now();
  const wrong = wrongCode([totp(secret, now - 30_000), totp(secret, now), totp(secret, now + 30_000)]);
  const refused = await submitMfaCode(page, wrong);
  recordMessage("E-P2-02a", "code TOTP erroné (6 chiffres)", text(refused), refused.path);
  expect(refused.path, "stays on /mfa").toBe("/mfa");
  expect(refused.notices.length, "a refusal is shown").toBeGreaterThan(0);

  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts += 1;
  });
  await page.locator("#mfa-code").fill("12345");
  await page.getByRole("button", { name: /Vérifier MFA/u }).click();
  await page.waitForTimeout(800);
  const message = await page.locator("#mfa-code").evaluate((element) => (element as HTMLInputElement).validationMessage);
  recordMessage("E-P2-02a", "code de 5 caractères (message du navigateur)", message || "(aucun)");
  expect(await page.locator("#mfa-code").evaluate((element) => (element as HTMLInputElement).validity.tooShort), "native too-short validation").toBe(true);
  expect(posts, "no request for a short code").toBe(0);
  expect(new URL(page.url()).pathname).toBe("/mfa");

  // The password-only session is not an MFA session.
  const token = (await brokerSessionCookie(page)) ?? "";
  const me = await apiCall(token, "GET", "/auth/me");
  expect(asRecord(me.body).mfaVerified, "still not MFA-verified").not.toBe(true);
  mfaPage = page;
});

test("E-P2-02b rejeu du même code TOTP (UI et API) : constat de sécurité H4, rejeu accepté", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  const account = member("used");
  const { password, secret } = usedPasswordHolder;
  if (!mfaPage) throw new Error("E-P2-02a did not leave the pre-MFA page");
  await waitForAuthBudget({ login: 2, mfa: 3 });
  const code = await freshTotp(secret);
  const issuedAt = Date.now();
  await mfaPage.locator("#mfa-code").fill(code);
  await mfaPage.getByRole("button", { name: /Vérifier MFA/u }).click();
  await mfaPage.waitForURL((url) => !url.pathname.startsWith("/mfa"));
  await mfaPage.context().close();
  mfaPage = undefined;

  // Replay 1 (API): same code, new password-only session.
  const session = await apiLogin(account.email, password);
  const apiReplay = await apiCall(session.accessToken, "POST", "/auth/mfa/verify", { code });
  recordMessage("E-P2-02b", "rejeu du code TOTP déjà accepté (API)", `HTTP ${apiReplay.status}`, `âge du code ${Math.round((Date.now() - issuedAt) / 1000)} s`);

  // Replay 2 (UI): same code, new browser context.
  const page = await brokerPage(browser);
  const step = await submitLogin(page, account.email, password);
  expect(step.path).toBe("/mfa");
  const uiReplay = await submitMfaCode(page, code);
  recordMessage("E-P2-02b", "rejeu du code TOTP déjà accepté (UI)", uiReplay.path.startsWith("/mfa") ? `refusé: ${text(uiReplay)}` : `accepté, redirigé vers ${uiReplay.path}`, `âge du code ${Math.round((Date.now() - issuedAt) / 1000)} s`);
  await page.context().close();

  constat(`H4 / E-P0-01e : le code TOTP n'est pas à usage unique. Rejeu API HTTP ${apiReplay.status}; rejeu UI ${uiReplay.path.startsWith("/mfa") ? "refusé" : "accepté"} (backend/src/modules/auth/mfa.service.ts:43, fenêtre ±30 s sans mémoire du dernier compteur). Attendu prudent : refus.`);
  expect([200, 201], "observed behaviour: the replayed code is accepted by the API").toContain(apiReplay.status);
  expect(uiReplay.path.startsWith("/mfa"), "observed behaviour: the replayed code is accepted by the screen").toBe(false);
});

// ---------------------------------------------------------------------------------------------
// E-P2-02c lockout (account "lock")
// ---------------------------------------------------------------------------------------------

const lockState: { password: string; secret: string; refusal?: ScreenOutcome; verifiedToken?: string } = { password: "", secret: "" };

test("E-P2-02c 5 échecs (3 mots de passe + 2 codes MFA, compteur partagé) : compte verrouillé, même le bon mot de passe est refusé", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  await waitForAuthBudget({ login: 6, mfa: 5 });
  const account = member("lock");
  lockState.password = STRONG("l3-lock");
  const activation = await brokerPage(browser);
  lockState.secret = await activateAndEnrol(activation, account.link, lockState.password);
  await activation.context().close();
  expect(userRow(account.email).status).toBe("active");

  const page = await brokerPage(browser);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const refused = await submitLogin(page, account.email, `${lockState.password}-faux${attempt}`);
    recordMessage("E-P2-02c", `connexion avec un mauvais mot de passe (échec ${attempt}/5)`, text(refused), `${refused.path}${refused.search}`);
    expect(refused.path).toBe("/login");
    expect(refused.hasSession, "no session on a wrong password").toBe(false);
    expect(refused.notices.length).toBeGreaterThan(0);
  }
  expect(userRow(account.email).failedLoginCount, "three failures counted").toBe(3);

  // The right password opens the password-only step and does NOT reset the shared counter.
  const step = await submitLogin(page, account.email, lockState.password);
  expect(step.path).toBe("/mfa");
  expect(userRow(account.email).failedLoginCount, "the password alone does not reset the lockout counter").toBe(3);

  const now = Date.now();
  const bad = wrongCode([totp(lockState.secret, now - 30_000), totp(lockState.secret, now), totp(lockState.secret, now + 30_000)]);
  const fourth = await submitMfaCode(page, bad);
  recordMessage("E-P2-02c", "code MFA erroné (échec 4/5)", text(fourth), fourth.path);
  expect(userRow(account.email).status, "not locked after 4 failures").toBe("active");
  const fifth = await submitMfaCode(page, bad);
  recordMessage("E-P2-02c", "code MFA erroné (échec 5/5)", text(fifth), fifth.path);
  const locked = userRow(account.email);
  expect(locked.status, "locked after the 5th shared failure").toBe("locked");
  expect(locked.lockedReason).toBe("failed-mfa-threshold");

  // Probe: the held password-only session with the RIGHT code, right after the lock (guard cache of 30 s).
  const heldToken = (await brokerSessionCookie(page)) ?? "";
  const probe = await apiCall(heldToken, "POST", "/auth/mfa/verify", { code: await freshTotp(lockState.secret) });
  recordMessage("E-P2-02c", "bon code TOTP sur la session déjà ouverte, juste après le verrouillage (API)", `HTTP ${probe.status}`);
  if (probe.status === 200 || probe.status === 201) {
    constat("Verrouillage non immédiat : un bon code TOTP présenté juste après le 5e échec, sur la session déjà ouverte, est accepté (cache d'accès 30 s du garde : user-access-status.service.ts:5, lock() n'invalide pas le cache).");
    const verifiedToken = String(asRecord(probe.body).accessToken ?? "");
    lockState.verifiedToken = verifiedToken;
    const immediate = await apiCall(verifiedToken, "GET", "/auth/trusted-devices");
    recordMessage("E-P2-02c", "route protégée avec le jeton MFA obtenu juste après le verrouillage (API)", `HTTP ${immediate.status}`);
    // The cache lives 30 s: after that the locked account is cut off whatever the token says.
    await new Promise((resolve) => setTimeout(resolve, 32_000));
    const later = await apiCall(verifiedToken, "GET", "/auth/trusted-devices");
    recordMessage("E-P2-02c", "même jeton 32 s plus tard (API)", `HTTP ${later.status}`);
    constat(`Jeton MFA d'un compte verrouillé : route protégée HTTP ${immediate.status} aussitôt, HTTP ${later.status} 32 s plus tard.`);
    expect(later.status, "a locked account is cut off once the 30 s access cache expired").toBe(401);
  }
  await page.context().close();

  // The right password is now refused with the generic refusal, no session, no MFA step.
  const fresh = await brokerPage(browser);
  const after = await submitLogin(fresh, account.email, lockState.password);
  recordMessage("E-P2-02c", "connexion avec le BON mot de passe d'un compte verrouillé", text(after), `${after.path}${after.search}`);
  expect(after.path, "refused: back on /login").toBe("/login");
  expect(after.hasSession, "no session for a locked account").toBe(false);
  expect(after.notices.length, "a refusal is shown").toBeGreaterThan(0);
  expect(after.notices.join(" ")).not.toMatch(/Compte verrouillé/u);
  await expect(fresh.locator("#mfa-code")).toHaveCount(0);
  lockState.refusal = after;
  await fresh.context().close();
});

test("E-P2-02c (texte) le refus d'un compte verrouillé affiche « Accès refusé ou identifiants invalides. »", async () => {
  test.fail(true, "ANOMALIE L3A-01 : un mauvais mot de passe ou un compte verrouillé affiche « Vérifiez le format de l'email et du mot de passe. » : l'API répond 400 (backend/src/modules/common/filters/error-response.filter.ts:125 statusForError : « Invalid credentials » contient « invalid ») et le courtier traduit tout 400 en validation_error (apps/broker/app/lib/broker-api.ts:23) ; la branche 401 « invalid_credentials » (broker-api.ts:27) n'est jamais atteinte et le message générique « Accès refusé ou identifiants invalides. » (login/page.tsx) n'est jamais montré.");
  const shown = lockState.refusal?.notices.join(" ") ?? "";
  expect(shown).toBe("Accès refusé ou identifiants invalides.");
});

test("E-P2-02c (déblocage) l'admin débloque le compte (/users/[userId], unlock) : la connexion est rétablie", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await waitForAuthBudget({ login: 3, mfa: 3 });
  const account = member("lock");
  const row = userRow(account.email);
  expect(row.status).toBe("locked");
  const notice = await adminUnlock(browser, row.id);
  recordMessage("E-P2-02c", "déblocage par l'admin (écran admin)", notice);
  const unlocked = userRow(account.email);
  expect(unlocked.status).toBe("active");
  expect(unlocked.failedLoginCount).toBe(0);
  if (unlocked.lockedReason) constat(`Après unlock, lockedReason reste « ${unlocked.lockedReason} » en base (même cause que L3A-03 : delete ignoré par Prisma, users.module.ts:236-237 ; donnée résiduelle sans effet sur l'accès).`);

  // The access guard keeps the account status for up to 30 s and the admin action does not invalidate that cache: watch the
  // token of the locked session (no extra login attempt) to see when the access is really back, then sign in again.
  if (lockState.verifiedToken) {
    const startedAt = Date.now();
    const first = await apiCall(lockState.verifiedToken, "GET", "/auth/trusted-devices");
    let status = first.status;
    while (status !== 200 && Date.now() - startedAt < 45_000) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      status = (await apiCall(lockState.verifiedToken, "GET", "/auth/trusted-devices")).status;
    }
    const delay = Math.round((Date.now() - startedAt) / 1000);
    recordMessage("E-P2-02c", "accès rétabli après unlock (API, jeton de la session verrouillée)", `HTTP ${first.status} aussitôt, HTTP ${status} après ${delay} s`);
    if (first.status !== 200) constat(`Déblocage non immédiat : juste après « unlock », le garde répond encore HTTP ${first.status} (cache d'accès de 30 s non invalidé par lock/unlock admin, user-access-status.service.ts:5, admin-users.controller.ts:190-198) ; accès rétabli après ${delay} s.`);
    expect(status, "access is back within the 30 s cache window").toBe(200);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 32_000));
  }

  const page = await brokerPage(browser);
  await login(page, { app: "broker", email: account.email, password: lockState.password, totpSecret: lockState.secret }, "/");
  expect(new URL(page.url()).pathname.startsWith("/login"), "connected again after the unlock").toBe(false);
  expect(new URL(page.url()).pathname.startsWith("/mfa")).toBe(false);
  expect(await brokerSessionCookie(page)).toBeTruthy();
  await page.context().close();
  constat("Déblocage par réinitialisation du mot de passe : non exécuté ici (le déblocage par l'admin suffit au cas ; la consommation d'un jeton de réinitialisation sur un compte verrouillé est couverte par le code, users.module.ts:131).");
});

// ---------------------------------------------------------------------------------------------
// E-P2-03a session absent / expired, return to the page, form action without a session (owner)
// ---------------------------------------------------------------------------------------------

let ownerSession: Page | undefined;

test("E-P2-03a session absente (session_required) puis cookie falsifié (session_expired) : messages et retour à la page demandée après reconnexion", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  await waitForAuthBudget({ login: 1, mfa: 1 });
  const page = await brokerPage(browser);
  for (const path of ["/leads", "/company", "/offers"]) {
    await page.goto(`${e2eEnv.brokerUrl}${path}`);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("reason"), `${path} without a cookie`).toBe("session_required");
    expect(url.searchParams.get("returnTo")).toBe(path);
    await expect(page.getByText("Connectez-vous pour accéder au back-office.")).toBeVisible();
    recordMessage("E-P2-03a", `${path} sans cookie de session`, (await noticeTexts(page)).join(" / "), `${url.pathname}${url.search}`);
  }

  // A cookie that is present but is not a valid token (expired or forged): same path as an expired 15-minute session.
  await page.context().addCookies([{ name: BROKER_TOKEN_COOKIE, value: "jeton.expire.ou.falsifie", url: e2eEnv.brokerUrl }]);
  for (const path of ["/leads", "/company"]) {
    await page.goto(`${e2eEnv.brokerUrl}${path}`);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("reason"), `${path} with a forged cookie`).toBe("session_expired");
    expect(url.searchParams.get("returnTo")).toBe(path);
    await expect(page.getByText("Votre session a expiré. Connectez-vous à nouveau.")).toBeVisible();
    recordMessage("E-P2-03a", `${path} avec un cookie expiré ou falsifié`, (await noticeTexts(page)).join(" / "), `${url.pathname}${url.search}`);
  }

  // Signing in again from that screen returns to the page that was asked for.
  await login(page, firm.owner, "/leads");
  await page.waitForURL((url) => url.pathname === "/leads");
  expect(new URL(page.url()).pathname, "back on the requested page").toBe("/leads");
  ownerSession = page;
});

test("E-P2-03a (action) un formulaire soumis après suppression du cookie : « Session expirée : reconnectez-vous puis recommencez. » ou redirection /login", async () => {
  test.setTimeout(3 * 60_000);
  const page = ownerSession;
  if (!page) throw new Error("E-P2-03a did not leave the owner session");
  test.fail(true, "ANOMALIE L3A-02 : sans cookie de session, la requête POST de l'action serveur (/company « Enregistrer ») est redirigée par le middleware vers /login ; le client Next ne suit pas cette redirection et l'écran affiche la page d'erreur « Une erreur est survenue / Votre espace courtier est momentanément indisponible » au lieu de « Session expirée : reconnectez-vous puis recommencez. » (apps/broker/middleware.ts:74, message prévu apps/broker/app/lib/self-service-messages.ts:132) ; même défaut que apps/admin/middleware.ts:55.");
  await page.goto(`${e2eEnv.brokerUrl}/company`);
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  await page.locator("input[name='city']").fill("Abidjan");
  await page.context().clearCookies({ name: BROKER_TOKEN_COOKIE });
  expect(await brokerSessionCookie(page)).toBeUndefined();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(2_500);
  const where = new URL(page.url());
  const screen = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/gu, " ").slice(0, 300);
  recordMessage("E-P2-03a", "/company « Enregistrer » après suppression du cookie", screen, `${where.pathname}${where.search}`);
  const informed = where.pathname.startsWith("/login") || /Session expirée/u.test(screen);
  expect(informed, `ni redirection /login ni « Session expirée » : ${where.pathname}${where.search} / ${screen}`).toBe(true);
  await page.context().close();
  ownerSession = undefined;
});

// ---------------------------------------------------------------------------------------------
// E-P2-03b password reset token, password change, trusted devices (account "pwd")
// ---------------------------------------------------------------------------------------------

test("E-P2-03b /password-change : mauvais mot de passe actuel refusé, puis « Mot de passe modifié. » avec révocation des appareils de confiance", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await waitForAuthBudget({ login: 0, mfa: 2 });
  const account = member("pwd");
  const current = STRONG("l3-pwd");
  const next = STRONG("l3-pwd-new");
  const page = await brokerPage(browser);
  // Activate and enrol with "trust this device" ticked, so there is a device to revoke.
  await activateAndEnrol(page, account.link, current, { trustDevice: true });
  await page.goto(`${e2eEnv.brokerUrl}/account/security`);
  await expect(trustedDeviceRows(page), "one trusted device before the change").toHaveCount(1);

  await page.goto(`${e2eEnv.brokerUrl}/password-change`);
  await page.locator("#password-old").fill(`${current}-faux`);
  await page.locator("#password-new").fill(next);
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect.poll(async () => (await noticeTexts(page)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const wrongOld = (await noticeTexts(page)).join(" / ");
  recordMessage("E-P2-03b", "/password-change avec un mauvais mot de passe actuel", wrongOld);
  expect(wrongOld, "the wrong current password is refused").not.toContain("Mot de passe modifié.");
  expect(userRow(account.email).failedLoginCount, "password-change failures do not touch the login counter").toBe(0);

  await page.locator("#password-old").fill(current);
  await page.locator("#password-new").fill(next);
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText("Mot de passe modifié.")).toBeVisible({ timeout: 30_000 });
  recordMessage("E-P2-03b", "/password-change avec le bon mot de passe actuel", "Mot de passe modifié.");

  await page.goto(`${e2eEnv.brokerUrl}/account/security`);
  await expect(page.getByText("Aucun appareil de confiance actif.")).toBeVisible();
  await expect(trustedDeviceRows(page).filter({ hasNotText: "Aucun appareil" }), "trusted devices revoked by the password change").toHaveCount(0);
  await page.context().close();
  pwdState.password = next;
});

const pwdState: { password: string } = { password: "" };

const resetState: { token: string; password: string } = { token: "", password: "" };

test("E-P2-03b /password-reset : un jeton valide change le mot de passe (« Mot de passe réinitialisé. Vous pouvez vous connecter. »), l'ancien ne marche plus", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await waitForAuthBudget({ login: 3, mfa: 2 });
  const account = member("pwd");
  const row = userRow(account.email);
  const token = await adminIssueToken(browser, row.id, account.email);
  const reset = STRONG("l3-pwd-reset");

  const page = await brokerPage(browser);
  await page.goto(`${e2eEnv.brokerUrl}/password-reset?token=${encodeURIComponent(token)}`);
  await expect(page.locator("#reset-token")).toHaveValue(token);
  await page.locator("#reset-password").fill(reset);
  await page.getByRole("button", { name: "Consommer le jeton" }).click();
  await expect(page.getByText("Mot de passe réinitialisé. Vous pouvez vous connecter.")).toBeVisible({ timeout: 30_000 });
  recordMessage("E-P2-03b", "/password-reset avec un jeton valide", "Mot de passe réinitialisé. Vous pouvez vous connecter.");
  await page.context().close();
  resetState.token = token;
  resetState.password = reset;

  // The password set by the reset logs in (password step); the one set by /password-change does not.
  const good = await apiLogin(account.email, reset);
  expect([200, 201], "new password logs in (password step)").toContain(good.result.status);
  expect(good.mfaRequired).toBe(true);
  const old = await apiLogin(account.email, pwdState.password);
  recordMessage("E-P2-03b", "connexion (API) avec le mot de passe d'avant la réinitialisation", refusalSignature(old.result), `HTTP ${old.result.status}`);
  expect(old.result.status, "the previous password no longer works").toBeGreaterThanOrEqual(400);
  expect(old.accessToken).toBe("");
});

test("E-P2-03b (second usage) le même jeton de réinitialisation est refusé une seconde fois", async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  test.fail(true, "ANOMALIE L3A-03 : même cause que pour le jeton d'activation : le jeton de réinitialisation consommé n'est pas effacé en base (users.repository.ts:245-246, `undefined` ignoré par Prisma, users.module.ts:129-130) ; il reste rejouable jusqu'à son expiration (30 min).");
  const page = await brokerPage(browser);
  await page.goto(`${e2eEnv.brokerUrl}/password-reset?token=${encodeURIComponent(resetState.token)}`);
  // Same password as the first use: if the replay is accepted, the account is left as it was.
  await page.locator("#reset-password").fill(resetState.password);
  await page.getByRole("button", { name: "Consommer le jeton" }).click();
  await expect.poll(async () => (await noticeTexts(page)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const second = (await noticeTexts(page)).join(" / ");
  recordMessage("E-P2-03b", "/password-reset avec le MÊME jeton une seconde fois", second);
  await page.context().close();
  expect(second, "second use refused").not.toContain("Mot de passe réinitialisé");
});

// ---------------------------------------------------------------------------------------------
// T-05 injection strings in the login e-mail
// ---------------------------------------------------------------------------------------------

test("T-05 e-mail de /login : ' OR '1'='1 et '; DROP TABLE leads;-- : aucune erreur 500, réponse identique à un e-mail inconnu banal", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  await waitForAuthBudget({ login: 4, mfa: 0 });
  const password = "Mot-de-passe-inconnu-L3";
  const page = await brokerPage(browser);
  const outcomes: Array<{ label: string; outcome: ScreenOutcome }> = [];
  for (const [label, email] of [
    ["e-mail inconnu banal", `inconnu.l3.${Date.now()}@broker-l3auth.e2e.test`],
    ["' OR '1'='1", "' OR '1'='1"],
    ["'; DROP TABLE leads;--", "'; DROP TABLE leads;--"]
  ] as const) {
    const outcome = await submitLogin(page, email, password, { bypass: true });
    outcomes.push({ label, outcome });
    recordMessage("T-05", `/login avec ${label}`, text(outcome), `${outcome.path}${outcome.search}`);
    expect(outcome.hasSession, `${label}: no session`).toBe(false);
    expect(outcome.path, `${label}: back on /login`).toBe("/login");
    await expect(page.getByText("Une erreur est survenue"), `${label}: no error page`).toHaveCount(0);
  }
  const [baseline, ...injections] = outcomes;
  for (const entry of injections) {
    expect(text(entry.outcome), `${entry.label}: same notice as an ordinary unknown e-mail`).toBe(text(baseline?.outcome as ScreenOutcome));
    expect(entry.outcome.search, `${entry.label}: same redirect as an ordinary unknown e-mail`).toBe((baseline?.outcome as ScreenOutcome).search);
  }
  const api = await apiCall(undefined, "POST", "/auth/login", { email: "'; DROP TABLE leads;--", password });
  recordMessage("T-05", "API POST /auth/login avec '; DROP TABLE leads;--", refusalSignature(api), `HTTP ${api.status}`);
  expect(api.status, "never a server error").toBeLessThan(500);
  expect(api.status).toBeGreaterThanOrEqual(400);
  await page.context().close();
});

// ---------------------------------------------------------------------------------------------
// T-09 table of every authentication message really shown
// ---------------------------------------------------------------------------------------------

test("T-09 tableau annoté des messages d'erreur d'authentification réellement affichés (accès refusé, aucune session)", async () => {
  const table = authMessagesTable();
  console.log(`\n${table}\n`);
  test.info().annotations.push({ type: "T-09", description: table });
  await test.info().attach("t09-messages-authentification.md", { body: table, contentType: "text/markdown" });
  const activation = authMessages.filter((entry) => entry.caseId.startsWith("E-P2-01"));
  expect(activation.length, "activation messages were collected").toBeGreaterThan(0);
  const refused = authMessages.filter((entry) => /refus|erron|expir|mauvais|altéré|utilisé|verrouill|inconnu/u.test(entry.situation));
  expect(refused.length, "refusals were collected").toBeGreaterThan(3);
});
