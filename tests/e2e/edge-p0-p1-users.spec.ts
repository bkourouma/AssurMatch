import { expect, test, type Browser, type Page } from "@playwright/test";
import { api, expectStatus, itemsOfBody, openPage, rec } from "./support/admin-lot11";
import { EDGE_REASON, sharedCountryId, sharedSuperAdmin, userIdByEmail } from "./support/edge-p0p1-accounts";
import {
  anomaly,
  cleanup,
  createUserApi,
  hypothesis,
  lifecycle,
  note,
  register,
  roleUpdate,
  superToken,
  tokenOf,
  userRoles,
  world,
  type World
} from "./support/edge-p0p1-users-support";
import { loadJourneyState } from "./support/journey-state";
import { closeSessions } from "./support/pro-roles";
import { uniqueSuffix } from "./support/ui";

// Lot 2 (edge cases of phase 0), part "users, roles, flags" of the admin app: scenario section 5 (E-P0-02a/b/c,
// E-P0-07a-e), security findings of section 16.2 (SEC-ESC-1, SEC-SELF-1, SEC-LAST-1), T-01 (audit, users part),
// T-04 / T-05 (admin part). Destructive cases only target throwaway accounts. The application code is never fixed
// here: a confirmed product bug keeps its test red and carries an `anomaly` annotation.
//
// Mode: NOT "serial". In serial mode the first red test (confirmed bug) would skip every following case, and a red
// test makes Playwright restart the worker anyway; the world (accounts, targets) therefore lives in a state file
// (support/edge-p0p1-users-support.ts) and the file order puts the green cases first, the security findings last.

// RBAC_DENIED is now mapped to this wording by the admin server actions (lot 7).
const FORBIDDEN_WRITE = "Vous n'avez pas le droit d'effectuer cette action.";
const FORBIDDEN_READ = "Accès refusé : droits insuffisants ou hors périmètre.";
const SQL_STRINGS = ["'; DROP TABLE leads;--", "' OR '1'='1"];
const XSS = "<script>alert(1)</script>";

test.afterAll(async () => {
  await closeSessions();
});

async function pageText(page: Page, max = 400): Promise<string> {
  return ((await page.locator("body").innerText().catch(() => "")) as string).replace(/\s+/gu, " ").trim().slice(0, max);
}

/** Submits the "Créer et émettre activation" form of /users and returns the text of its result notice. */
async function submitCreateForm(
  page: Page,
  input: { email: string; displayName: string; roles: string[]; partner?: boolean; reason?: string }
): Promise<string> {
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Créer et émettre activation" }) });
  await create.locator("input[name='email']").fill(input.email);
  await create.locator("input[name='displayName']").fill(input.displayName);
  for (const role of input.roles) await create.locator(`input[name='roles'][value='${role}']`).check();
  if (input.partner) await create.locator("select[name='partnerTenantId']").selectOption({ index: 1 });
  await create.locator("textarea[name='reason']").fill(input.reason ?? EDGE_REASON);
  await create.getByRole("button", { name: "Créer et émettre activation" }).click();
  const notice = create.locator(".bo-notice[data-tone]").first();
  await expect(notice).toBeVisible({ timeout: 30_000 });
  return (await notice.innerText()).replace(/\s+/gu, " ").trim();
}

function newEmail(label: string): string {
  return `l2.${label}.${uniqueSuffix()}@e2e.assurmatch.test`;
}

/** A global flag with no effect on the journeys of the other lots (never a public, broker, country or sensitive flag). */
const BUSY_FLAGS = /public_|quote_|starter_|broker_|country_|product_|ai_|sms|whatsapp|billing|payment|signature|claim|insurer|webhook|routing|retention|satisfaction|partner_|crm_|messaging|dashboard|portal|comparator|waitlist|maintenance|kill/u;

async function harmlessFlag(browser: Browser, token: string): Promise<{ id: string; key: string; value: boolean } | undefined> {
  // Only flags the screen offers a toggle for (the others are read-only or sensitive), and none used by the journeys of the other lots.
  const page = await openPage(browser, sharedSuperAdmin(), "/feature-flags");
  const keys = (await page.locator("form[data-feature-flag-form]").evaluateAll((forms) => forms.map((form) => form.getAttribute("data-feature-flag-form") ?? ""))) as string[];
  console.log(`[users] toggle forms offered on /feature-flags: ${keys.join(", ")}`);
  note("flags-toggle-forms", keys.join(", "));
  const list = await api(token, "GET", "/admin/feature-flags");
  expectStatus(list, 200, "list feature flags");
  const flags = itemsOfBody(list.body);
  const found = flags.find((flag) => flag.scopeType === "global" && keys.includes(String(flag.key)) && !BUSY_FLAGS.test(String(flag.key)));
  return found ? { id: String(found.id), key: String(found.key), value: found.value === true } : undefined;
}

test("SETUP comptes jetables : admin_pays CI, compliance, support, finance, 2 super admins, 3 cibles", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const w = await world(browser);
  expect(Object.keys(w.accounts)).toHaveLength(6);
  expect(Object.values(w.accounts).every((account) => account.id.length > 10)).toBe(true);
});

// ---------------------------------------------------------------------------------------------------------------------
// E-P0-07 : création d'utilisateurs
// ---------------------------------------------------------------------------------------------------------------------

test("E-P0-07a e-mail déjà utilisé : 409 EMAIL_ALREADY_USED, message lisible, aucun détail ORM", async ({ browser }) => {
  const w = await world(browser);
  const token = await superToken(browser);
  const direct = await api(token, "POST", "/admin/users", {
    email: w.accounts.ap.email,
    displayName: `${w.tag} doublon api`,
    roles: ["content_admin"],
    partnerTenantId: null,
    scopes: { countryIds: [], productIds: [] },
    reason: EDGE_REASON
  });
  console.log(`[users] E-P0-07a api -> ${direct.status} ${direct.text.slice(0, 200)}`);
  note("api", `${direct.status} ${direct.text.slice(0, 200)}`);
  const page = await openPage(browser, sharedSuperAdmin(), "/users");
  const message = await submitCreateForm(page, { email: w.accounts.ap.email, displayName: `${w.tag} doublon`, roles: ["content_admin"] });
  console.log(`[users] E-P0-07a screen -> ${message}`);
  note("screen", message);
  expectStatus(direct, 409, "create with a used e-mail");
  expect(rec(direct.body).code).toBe("EMAIL_ALREADY_USED");
  expect(direct.text, "no ORM detail leaks").not.toMatch(/prisma|User_email_key|Unique constraint/iu);
  expect(message).toContain("Cette adresse e-mail est déjà utilisée.");
});

test("E-P0-07b rôle courtier sans courtier, rôle admin avec courtier : messages du formulaire et refus API 422", async ({ browser }) => {
  const w = await world(browser);
  const page = await openPage(browser, sharedSuperAdmin(), "/users");
  const brokerWithout = await submitCreateForm(page, { email: newEmail("brk0"), displayName: `${w.tag} brk0`, roles: ["broker_owner_starter"] });
  expect(brokerWithout).toContain("Un rôle courtier exige de choisir le courtier de rattachement.");

  await page.goto("/users");
  const adminWith = await submitCreateForm(page, { email: newEmail("adm1"), displayName: `${w.tag} adm1`, roles: ["content_admin"], partner: true });
  expect(adminWith).toContain("Un rôle admin ne peut pas être rattaché à un courtier : retirez le courtier ou choisissez un rôle courtier.");

  // Same rules behind the screen (the API is the authority).
  const token = await superToken(browser);
  const partnerId = String(loadJourneyState().partnerId ?? "");
  const withoutPartner = await createUserApi(token, { roles: ["broker_owner_starter"], label: "brkapi" });
  note("api broker without partner", `${withoutPartner.result.status} ${withoutPartner.result.text.slice(0, 160)}`);
  expectStatus(withoutPartner.result, 422, "broker role without partner");
  expect(withoutPartner.result.text).toContain("PARTNER_USER_INVALID");
  if (partnerId) {
    const adminWithPartner = await api(token, "POST", "/admin/users", {
      email: newEmail("admapi"),
      displayName: `${w.tag} admapi`,
      roles: ["content_admin"],
      partnerTenantId: partnerId,
      scopes: { countryIds: [], productIds: [] },
      reason: EDGE_REASON
    });
    note("api admin with partner", `${adminWithPartner.status} ${adminWithPartner.text.slice(0, 160)}`);
    expectStatus(adminWithPartner, 422, "admin role with partner");
    expect(adminWithPartner.text).toContain("PARTNER_USER_INVALID");
  }
});

test("E-P0-07c compliance_admin, support_admin, finance_admin ne créent pas d'utilisateur : 403", async ({ browser }) => {
  const w = await world(browser);
  // Screen (compliance_admin): "Action refusée : droits insuffisants ou hors périmètre."
  const page = await openPage(browser, w.accounts.ca2, "/users");
  const message = await submitCreateForm(page, { email: newEmail("c403"), displayName: `${w.tag} c403`, roles: ["content_admin"] });
  note("screen compliance_admin", message);
  expect(message).toContain(FORBIDDEN_WRITE);

  for (const key of ["ca2", "su", "fa"] as const) {
    const token = await tokenOf(browser, w.accounts[key]);
    const attempt = await createUserApi(token, { roles: ["content_admin"], label: `deny${key}` });
    note(`api ${key}`, `${attempt.result.status}`);
    expectStatus(attempt.result, 403, `${key} creates a user`);
    if (attempt.created) register(w, attempt.created);
  }
});

test("E-P0-07c admin_pays : crée dans ses pays, pas hors périmètre, pas de super_admin", async ({ browser }) => {
  const w = await world(browser);
  const token = await tokenOf(browser, w.accounts.ap);
  const country = sharedCountryId();

  const inScope = await createUserApi(token, { roles: ["content_admin"], label: "apin", countryIds: [country] });
  note("in scope", `${inScope.result.status}`);
  if (inScope.created) register(w, inScope.created);
  expectStatus(inScope.result, 201, "admin_pays creates in its own country");

  const outside = await createUserApi(token, { roles: ["content_admin"], label: "apout", countryIds: ["00000000-0000-4000-8000-0000000000aa"] });
  note("out of scope", `${outside.result.status}`);
  if (outside.created) register(w, outside.created);
  expectStatus(outside.result, 403, "admin_pays creates outside its countries");

  const noScope = await createUserApi(token, { roles: ["content_admin"], label: "apnone", countryIds: [] });
  note("no country scope", `${noScope.result.status}`);
  if (noScope.created) register(w, noScope.created);
  expectStatus(noScope.result, 403, "admin_pays creates with no country scope");

  const superRole = await createUserApi(token, { roles: ["super_admin"], label: "apsup", countryIds: [country] });
  note("super_admin role", `${superRole.result.status}`);
  if (superRole.created) register(w, superRole.created);
  expectStatus(superRole.result, 403, "admin_pays creates a super_admin");
});

// ---------------------------------------------------------------------------------------------------------------------
// E-P0-02 : feature flags
// ---------------------------------------------------------------------------------------------------------------------

test("E-P0-02a motif de 7 caractères : champ minLength=8 et refus API", async ({ browser }) => {
  const page = await openPage(browser, sharedSuperAdmin(), "/feature-flags");
  const token = await superToken(browser);
  const flag = await harmlessFlag(browser, token);
  expect(flag, "a flag without effect on the other lots must exist").toBeDefined();
  if (!flag) return;
  note("flag used", `${flag.key} (value ${String(flag.value)})`);

  const form = page.locator(`form[data-feature-flag-form='${flag.key}']`);
  await expect(form).toBeVisible();
  const reason = form.locator("input[name='reason']");
  expect(await reason.getAttribute("minlength")).toBe("8");
  await reason.fill("1234567");
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await form.getByRole("button", { name: /Activer|Désactiver/u }).click();
  await page.waitForTimeout(1500);
  expect(posts, "the browser blocks the 7-character reason before any request").toHaveLength(0);
  expect(await reason.evaluate((input) => (input as HTMLInputElement).validity.tooShort)).toBe(true);

  // API: same value as today (no-op even if it were accepted), 7-character reason.
  const direct = await api(token, "PATCH", `/admin/feature-flags/${flag.id}`, { value: flag.value, reason: "1234567" });
  note("api", `${direct.status} ${direct.text.slice(0, 200)}`);
  hypothesis("Le scénario attend « Reason is required » ; l'API répond 400 VALIDATION_FAILED « Validation failed » (le schéma updateFeatureFlagSchema refuse avant le contrôleur). Refus bien présent, texte différent.");
  expect(direct.status).toBe(400);
  expect(direct.text).toContain("VALIDATION_FAILED");
  const after = await api(token, "GET", "/admin/feature-flags");
  expect(itemsOfBody(after.body).find((entry) => entry.id === flag.id)?.value, "the flag value did not move").toBe(flag.value);
});

test("E-P0-02b aucun bouton pour les modules réglementés ; PATCH true refusé", async ({ browser }) => {
  const page = await openPage(browser, sharedSuperAdmin(), "/feature-flags");
  await expect(page.getByText("Cette interface ne crée aucun bouton d'activation pour les modules réglementés.")).toBeVisible();
  for (const key of ["billing_enabled", "satisfaction_survey_enabled", "multi_broker_routing_enabled"]) {
    await expect(page.locator(`form[data-feature-flag-form='${key}']`)).toHaveCount(0);
  }
  const aiForms = (await page.locator("form[data-feature-flag-form^='ai_']").evaluateAll((forms) => forms.map((form) => form.getAttribute("data-feature-flag-form") ?? ""))) as string[];
  console.log(`[users] E-P0-02b ai_* toggle forms: ${aiForms.join(", ") || "none"}`);
  note("ai forms", aiForms.join(", ") || "none");
  if (aiForms.length > 0) {
    anomaly(
      `MAJEUR (conformité IA) : /feature-flags offre un bouton Activer/Désactiver pour ${aiForms.join(", ")} alors que le scénario (E-P0-02b) et docs/prd_coverage_map.md:41 disent que les flags IA visiteur ne s'ouvrent que par ops:apply-flag-policy. ` +
        "Cause : backend/src/modules/feature-flags/sensitive-feature-flag-policy.ts:12 (aiFlagsWithExplicitMutationPolicy contient ai_summary_enabled) et :84-85 (isSensitiveFeatureFlagKey n'exclut que les autres ai_*), reprise par apps/admin/app/lib/ui/admin-view-models.ts. " +
        "Constat par l'écran seulement : le PATCH n'a PAS été rejoué sur ce flag (flag IA visiteur partagé avec les autres lots). Correctif : retirer ai_summary_enabled de aiFlagsWithExplicitMutationPolicy (ne garder que ai_partner_opt_out, restrictif) et le classer sensible."
    );
  }
  expect.soft(aiForms, "no activation button for the ai_* modules").toEqual([]);

  const token = await superToken(browser);
  const list = await api(token, "GET", "/admin/feature-flags");
  expectStatus(list, 200, "list feature flags");
  const flags = itemsOfBody(list.body);
  const results: string[] = [];
  // ai_summary_enabled is a sensitive flag since lot 5 (opened by ops:apply-flag-policy only).
  for (const key of ["billing_enabled", "satisfaction_survey_enabled", "multi_broker_routing_enabled", "ai_summary_enabled"]) {
    const flag = flags.find((entry) => entry.key === key && entry.scopeType === "global");
    if (!flag) {
      hypothesis(`${key} n'est pas enregistré dans la table des flags (fail-closed) : aucune ligne à patcher, un PATCH d'un id inconnu donne 404.`);
      const unknown = await api(token, "PATCH", "/admin/feature-flags/00000000-0000-4000-8000-0000000000bb", { value: true, reason: EDGE_REASON });
      results.push(`${key}: not registered, unknown id -> ${unknown.status}`);
      expect([403, 404]).toContain(unknown.status);
      continue;
    }
    if (flag.value === true) {
      note("not-run", `${key} is already true on this stack: no activation to attempt (NOT RUN for this flag).`);
      results.push(`${key}: NOT RUN, already true`);
      continue;
    }
    let activated = false;
    try {
      const attempt = await api(token, "PATCH", `/admin/feature-flags/${String(flag.id)}`, { value: true, reason: EDGE_REASON });
      results.push(`${key}: ${attempt.status} ${attempt.text.slice(0, 140)}`);
      activated = attempt.status < 300;
      if (activated) anomaly(`MAJEUR : PATCH /admin/feature-flags/:id a activé ${key} (flag sensible) alors que la politique devait refuser. Voir backend/src/modules/feature-flags/sensitive-feature-flag-policy.ts evaluateFeatureFlagMutation.`);
      expect(attempt.status, `${key} must be refused`).toBe(403);
      expect(attempt.text).toMatch(/CATALOG_FLAG_NOT_TOGGLEABLE|ACTIVATION_VIA_OPS_ONLY|sensitive|compliance/iu);
    } finally {
      if (activated) await api(token, "PATCH", `/admin/feature-flags/${String(flag.id)}`, { value: false, reason: "Retour a false apres test E2E L2" });
    }
  }
  note("results", results.join(" | "));
});

test("E-P0-02c compliance_admin ne bascule pas un flag global : 403", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const flag = await harmlessFlag(browser, sa);
  expect(flag, "a flag without effect on the other lots must exist").toBeDefined();
  if (!flag) return;
  const page = await openPage(browser, w.accounts.ca2, "/feature-flags");
  note("screen compliance_admin", await pageText(page, 300));
  await expect(page.getByText(FORBIDDEN_READ).first()).toBeVisible();
  expect(await page.locator("form[data-feature-flag-form]").count(), "no toggle form for a role without feature_flags").toBe(0);

  const token = await tokenOf(browser, w.accounts.ca2);
  let changed = false;
  try {
    const attempt = await api(token, "PATCH", `/admin/feature-flags/${flag.id}`, { value: !flag.value, reason: EDGE_REASON });
    note("api", `${attempt.status} ${attempt.text.slice(0, 160)}`);
    changed = attempt.status < 300;
    if (changed) anomaly(`MAJEUR : compliance_admin a basculé le flag global ${flag.key} (feature_flags:update absent de sa matrice).`);
    expect(attempt.status).toBe(403);
  } finally {
    if (changed) await api(sa, "PATCH", `/admin/feature-flags/${flag.id}`, { value: flag.value, reason: "Retour etat initial apres test E2E L2" });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// E-P0-07e : support_admin
// ---------------------------------------------------------------------------------------------------------------------

test("E-P0-07e support_admin : /partners, /feature-flags, /billing en refus (écran et API 403)", async ({ browser }) => {
  const w = await world(browser);
  const screens: string[] = [];
  // /partners: support_admin holds partners:read in the role matrix, so the list is readable (scenario text says refused: see hypothesis).
  const partnersPage = await openPage(browser, w.accounts.su, "/partners");
  screens.push(`/partners: ${await pageText(partnersPage, 200)}`);
  hypothesis("Le scénario attend une lecture refusée sur /partners pour support_admin ; la matrice (packages/shared/rbac/assurmatch-role-matrix.ts:27) lui accorde partners:read : lecture autorisée, écriture refusée (testée par API).");
  await expect(partnersPage.getByText(FORBIDDEN_READ)).toHaveCount(0);
  // /feature-flags and /billing: read refused with the page's own wording.
  const flagsPage = await openPage(browser, w.accounts.su, "/feature-flags");
  screens.push(`/feature-flags: ${await pageText(flagsPage, 200)}`);
  await expect(flagsPage.getByText(FORBIDDEN_READ).first()).toBeVisible();
  expect(await flagsPage.locator("form[data-feature-flag-form]").count()).toBe(0);
  const billingPage = await openPage(browser, w.accounts.su, "/billing");
  screens.push(`/billing: ${await pageText(billingPage, 200)}`);
  await expect(billingPage.getByText("Votre rôle ne permet pas d'accéder à la facturation.")).toBeVisible();
  note("screens", screens.join(" || "));

  const sa = await superToken(browser);
  const flag = await harmlessFlag(browser, sa);
  const token = await tokenOf(browser, w.accounts.su);
  const probes: Array<[string, "GET" | "POST" | "PATCH" | "PUT", string, number, Record<string, unknown>?]> = [
    ["GET partners (partners:read held by the role)", "GET", "/admin/partners", 200],
    ["GET feature-flags", "GET", "/admin/feature-flags", 403],
    ["GET billing foundation", "GET", "/admin/billing/foundation", 403],
    ["GET billing plans", "GET", "/admin/billing/plans", 403]
  ];
  if (flag) probes.push(["PATCH feature-flag", "PATCH", `/admin/feature-flags/${flag.id}`, 403, { value: flag.value, reason: EDGE_REASON }]);
  const statuses: string[] = [];
  for (const [label, method, route, expected, body] of probes) {
    const result = await api(token, method, route, body);
    statuses.push(`${label}=${result.status}`);
    expect.soft(result.status, `${label} -> ${result.text.slice(0, 200)}`).toBe(expected);
  }
  note("api", statuses.join(", "));
});

test("E-P0-07e bis support_admin : écritures partenaires et facturation refusées en 403 avant toute validation", async ({ browser }) => {
  const w = await world(browser);
  const token = await tokenOf(browser, w.accounts.su);
  const probes: Array<[string, "POST" | "PUT", string]> = [
    ["POST /admin/partners", "POST", "/admin/partners"],
    ["PUT /admin/billing/plans", "PUT", "/admin/billing/plans"]
  ];
  const statuses: string[] = [];
  for (const [label, method, route] of probes) {
    const result = await api(token, method, route, {});
    statuses.push(`${label}=${result.status}`);
    if (result.status === 400) {
      anomaly(
        `MINEURE : ${label} avec un corps vide par support_admin → 400 VALIDATION_FAILED au lieu de 403 : la validation du corps passe avant le contrôle de rôle (le schéma de l'endpoint est révélé à un rôle sans droit d'écriture). ` +
          "Cause : backend/src/modules/http-wiring/runtime-http-wiring.module.ts (méthodes create des contrôleurs admin : parseHttpInput avant assertPermission ; à comparer avec AdminFeatureFlagsController.update l.1564-1568 qui contrôle le rôle d'abord). Correctif : appeler assertPermission/assertAnyRole avant parseHttpInput."
      );
    }
    expect.soft(result.status, `${label} -> ${result.text.slice(0, 160)}`).toBe(403);
  }
  note("api", statuses.join(", "));
});

// ---------------------------------------------------------------------------------------------------------------------
// T-04 / T-05 (admin part)
// ---------------------------------------------------------------------------------------------------------------------

test("T-04 nom affiché XSS : affiché en texte sur /users et /users/[userId], aucun dialog", async ({ browser }) => {
  const w = await world(browser);
  const token = await superToken(browser);
  const name = `${XSS} ${w.tag} xss`;
  const { result, created } = await createUserApi(token, { roles: ["content_admin"], label: "xss", displayName: name });
  expectStatus(result, 201, "create user with an XSS display name");
  if (!created) return;
  register(w, created);

  const page = await openPage(browser, sharedSuperAdmin(), `/users?search=${encodeURIComponent(`${w.tag} xss`)}`);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await expect(page.getByText(XSS, { exact: false }).first()).toBeVisible();
  expect(await page.locator("main script").count(), "no <script> element injected in the list").toBe(0);
  await page.goto(`/users/${created.id}`);
  await expect(page.getByText(XSS, { exact: false }).first()).toBeVisible();
  expect(await page.locator("main script").count(), "no <script> element injected in the detail").toBe(0);
  await page.waitForTimeout(800);
  expect(dialogs, "no JavaScript dialog opened").toEqual([]);
});

test("T-05 chaînes SQL dans la recherche /users et les filtres d'audit : aucun 500", async ({ browser }) => {
  await world(browser);
  const page = await openPage(browser, sharedSuperAdmin(), "/users");
  const token = await superToken(browser);
  for (const sql of SQL_STRINGS) {
    for (const route of [`/users?search=${encodeURIComponent(sql)}`, `/compliance/audit-logs?action=${encodeURIComponent(sql)}`, `/compliance/audit-logs?targetId=${encodeURIComponent(sql)}`]) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} status`).toBeLessThan(500);
      const text = await pageText(page, 1200);
      expect(text, `${route} renders a normal page`).not.toMatch(/Application error|server-side exception|Internal Server Error/iu);
    }
    const searchPage = await page.goto(`/users?search=${encodeURIComponent(sql)}`);
    expect(searchPage?.status()).toBe(200);
    await expect(page.getByText("Aucun utilisateur pour ces filtres.")).toBeVisible();

    for (const route of [`/admin/audit-logs?action=${encodeURIComponent(sql)}`, `/admin/audit-logs?targetId=${encodeURIComponent(sql)}`, `/admin/audit-logs?actorId=${encodeURIComponent(sql)}`]) {
      const result = await api(token, "GET", route);
      note("api", `${route.slice(0, 40)} -> ${result.status}`);
      expect(result.status, `${route} -> ${result.text.slice(0, 160)}`).toBeLessThan(500);
      if (result.status === 200) expect(itemsOfBody(result.body).length).toBe(0);
    }
    const role = await api(token, "GET", `/admin/users?role=${encodeURIComponent(sql)}`);
    expect(role.status, "invalid role filter is a client error, not a 500").toBeLessThan(500);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// E-P0-07d : cohérence interface / API des motifs
// ---------------------------------------------------------------------------------------------------------------------

test("E-P0-07d suspension avec un motif de 5 à 7 caractères : l'API refuse, le champ devrait bloquer (minLength=8)", async ({ browser }) => {
  const w = await world(browser);
  const token = await superToken(browser);
  const direct = await lifecycle(token, w.targets.t2.id, "suspend", "1234567");
  note("api suspend 7 chars", `${direct.status} ${direct.text.slice(0, 200)}`);
  expectStatus(direct, 400, "suspend with a 7-character reason");

  const page = await openPage(browser, sharedSuperAdmin(), `/users/${w.targets.t2.id}?tab=actions`);
  await page.getByRole("button", { name: "Confirmer suspend" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  const field = dialog.locator("textarea[name='reason']");
  const minLength = await field.getAttribute("minlength");
  await field.fill("Motif6");
  await dialog.getByRole("button", { name: "Confirmer suspend" }).last().click();
  await page.waitForTimeout(3000);
  const shown = await pageText(page, 300);
  note("screen after submit (6 chars)", `${shown} | url ${page.url().replace(/^https?:\/\/[^/]+/u, "")}`);
  const after = await userRoles(token, w.targets.t2.id);
  expect(after.status, "the 6-character suspension must not have been applied").not.toBe("suspended");
  if (minLength !== "8") {
    anomaly(
      `MINEURE : le champ « Raison pour suspend » accepte 5 à 7 caractères (minLength=${minLength}) alors que l'API exige 8 (reasonSchema, packages/shared/validation/common.schemas.ts:9) ; ` +
        "le refus API devient une exception non gérée de la server action adminUserLifecycleAction (apps/admin/app/users/actions.ts) : écran réel = « " + shown.slice(0, 120) + " ». " +
        "Fichiers : apps/admin/app/users/[userId]/page.tsx:172 et :195 (minLength={5}). Correctif : minLength={8} et intercepter l'erreur API dans la server action (message « le motif doit contenir au moins 8 caractères »)."
    );
  }
  expect(minLength, "the reason field must require as many characters as the API").toBe("8");
});

test("E-P0-07d bis autres formulaires de /users : minLength de « Raison auditable » vs contrainte API (8)", async ({ browser }) => {
  const w = await world(browser);
  const found: Record<string, string | null> = {};
  const creation = await openPage(browser, sharedSuperAdmin(), "/users");
  found["création (users/page, user-action-forms.tsx:83)"] = await creation.locator("form").filter({ has: creation.getByRole("button", { name: "Créer et émettre activation" }) }).locator("textarea[name='reason']").getAttribute("minlength");

  const base = `/users/${w.targets.t2.id}`;
  const profile = await openPage(browser, sharedSuperAdmin(), base);
  found["profil (page.tsx:130)"] = await profile.locator("textarea[name='reason']").first().getAttribute("minlength");
  const roles = await openPage(browser, sharedSuperAdmin(), `${base}?tab=roles`);
  found["rôles (page.tsx:150)"] = await roles.locator("textarea[name='reason']").first().getAttribute("minlength");
  const actions = await openPage(browser, sharedSuperAdmin(), `${base}?tab=actions`);
  found["unsuspend/unlock (page.tsx:172)"] = await actions.locator("#user-reason-unsuspend").getAttribute("minlength");
  await actions.getByRole("button", { name: "Émettre un jeton" }).first().click();
  found["réinitialisation mot de passe (user-action-forms.tsx:117)"] = await actions.locator("dialog[open] textarea[name='reason']").getAttribute("minlength");
  note("minLength observed", JSON.stringify(found));

  // API side: 7 characters are refused on every one of those operations (nothing is changed).
  const token = await superToken(browser);
  const apiStatuses: Record<string, number> = {};
  apiStatuses.create = (await createUserApi(token, { roles: ["content_admin"], label: "short7", reason: "1234567" })).result.status;
  apiStatuses.roles = (await roleUpdate(token, w.targets.t2.id, ["content_admin"], "1234567")).status;
  apiStatuses.passwordReset = (await api(token, "POST", `/admin/users/${w.targets.t2.id}/password-reset`, { reason: "1234567" })).status;
  apiStatuses.profile = (await api(token, "PATCH", `/admin/users/${w.targets.t2.id}`, { displayName: "x y", reason: "1234567" })).status;
  note("api statuses (7 characters)", JSON.stringify(apiStatuses));
  for (const [name, status] of Object.entries(apiStatuses)) expect(status, `API ${name} with 7 characters`).toBe(400);

  const wrong = Object.entries(found).filter(([, value]) => value !== "8");
  if (wrong.length > 0) {
    anomaly(
      `MINEURE : minLength de « Raison auditable » != 8 (API : 8 caractères, packages/shared/validation/common.schemas.ts:9) sur : ${wrong.map(([name, value]) => `${name}=${String(value)}`).join(" ; ")}. ` +
        "Correctif : minLength={8} sur ces champs (apps/admin/app/users/user-action-forms.tsx:83,117 ; apps/admin/app/users/[userId]/page.tsx:130,150,172,195), comme feature-flag-forms.tsx:25."
    );
  }
  for (const [name, value] of Object.entries(found)) expect.soft(value, `minLength of ${name}`).toBe("8");
});

// ---------------------------------------------------------------------------------------------------------------------
// SEC-ESC-1 : escalade de rôle
// ---------------------------------------------------------------------------------------------------------------------

const ESC_CAUSE =
  "backend/src/modules/users/admin-user-roles.controller.ts:25-32 canUpdateRoles : compliance_admin autorisé sans condition (l.27), admin_pays autorisé dès que la cible est dans ses pays (l.28-30), " +
  "aucune vérification du rôle attribué (l.21-22 : seul assertSystemRole), aucune interdiction de s'auto-attribuer un rôle. users.module.ts:59-73 updateRoles n'ajoute aucun garde-fou. " +
  "Correctif : réserver l'attribution et le retrait de super_admin au super_admin ; refuser à l'acteur d'accorder un rôle supérieur ou égal au sien (compliance_admin ne peut attribuer que des rôles inférieurs ; admin_pays ne peut attribuer que des rôles limités à ses pays, jamais super_admin, compliance_admin ni admin_pays) ; interdire l'auto-modification des rôles.";

async function expectNoEscalation(
  browser: Browser,
  w: World,
  options: { actor: "ap" | "ca2"; targetId: string; targetOriginal: string[]; add: string; label: string }
): Promise<void> {
  const sa = await superToken(browser);
  const actorToken = await tokenOf(browser, w.accounts[options.actor]);
  const attempt = await roleUpdate(actorToken, options.targetId, [...options.targetOriginal, options.add]);
  const after = await userRoles(sa, options.targetId);
  const escalated = after.roles.includes(options.add);
  note("api", `${options.label}: ${attempt.status} ${attempt.text.slice(0, 140)} -> roles ${after.roles.join("+")}`);
  try {
    if (escalated) anomaly(`BLOQUANT (sécurité) : ${options.label} réussi (HTTP ${attempt.status}). ${ESC_CAUSE}`);
    expect(attempt.status, options.label).toBe(403);
    expect(escalated, `${options.label}: ${options.add} must not be granted`).toBe(false);
  } finally {
    if (escalated) await roleUpdate(sa, options.targetId, options.targetOriginal);
  }
}

test("SEC-ESC-1a admin_pays attribue super_admin à un compte jetable : écran puis API", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const target = w.targets.t1;
  // Screen: /users/[userId]?tab=roles as admin_pays (target in the admin's country).
  const page = await openPage(browser, w.accounts.ap, `/users/${target.id}?tab=roles`);
  await page.locator("input[name='roles'][value='super_admin']").check();
  await page.locator("textarea[name='reason']").fill(EDGE_REASON);
  await page.getByRole("button", { name: "Mettre à jour les rôles" }).click();
  await page.waitForTimeout(3000);
  const screen = await pageText(page, 260);
  const viaScreen = await userRoles(sa, target.id);
  note("screen", `${screen} | roles after: ${viaScreen.roles.join("+")}`);
  try {
    if (viaScreen.roles.includes("super_admin")) anomaly(`BLOQUANT (sécurité) : un admin_pays a promu un compte super_admin depuis l'écran /users/[userId]. ${ESC_CAUSE}`);
    expect(viaScreen.roles, "screen: admin_pays must not grant super_admin").not.toContain("super_admin");
  } finally {
    if (viaScreen.roles.includes("super_admin")) await roleUpdate(sa, target.id, target.roles);
  }
  await expectNoEscalation(browser, w, { actor: "ap", targetId: target.id, targetOriginal: target.roles, add: "super_admin", label: "SEC-ESC-1a admin_pays -> super_admin (API)" });
});

test("SEC-ESC-1b compliance_admin attribue super_admin à un compte jetable : API", async ({ browser }) => {
  const w = await world(browser);
  await expectNoEscalation(browser, w, { actor: "ca2", targetId: w.targets.t2.id, targetOriginal: w.targets.t2.roles, add: "super_admin", label: "SEC-ESC-1b compliance_admin -> super_admin" });
});

test("SEC-ESC-1c admin_pays attribue compliance_admin à un compte jetable : API", async ({ browser }) => {
  const w = await world(browser);
  await expectNoEscalation(browser, w, { actor: "ap", targetId: w.targets.t3.id, targetOriginal: w.targets.t3.roles, add: "compliance_admin", label: "SEC-ESC-1c admin_pays -> compliance_admin" });
});

test("SEC-ESC-1d admin_pays s'auto-attribue super_admin : API", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const token = await tokenOf(browser, w.accounts.ap);
  const attempt = await roleUpdate(token, w.accounts.ap.id, ["admin_pays", "super_admin"]);
  const after = await userRoles(sa, w.accounts.ap.id);
  const escalated = after.roles.includes("super_admin");
  note("api", `${attempt.status} ${attempt.text.slice(0, 140)} -> roles ${after.roles.join("+")}`);
  try {
    if (escalated) anomaly(`BLOQUANT (sécurité) : un admin_pays s'auto-attribue super_admin (HTTP ${attempt.status}) ; son périmètre pays contient sa propre fiche. ${ESC_CAUSE}`);
    expect(attempt.status).toBe(403);
    expect(escalated, "self-assigned super_admin").toBe(false);
  } finally {
    if (escalated) await roleUpdate(sa, w.accounts.ap.id, ["admin_pays"]);
  }
});

test("SEC-ESC-1e admin_pays crée un compte compliance_admin dans son pays : API", async ({ browser }) => {
  const w = await world(browser);
  const token = await tokenOf(browser, w.accounts.ap);
  const attempt = await createUserApi(token, { roles: ["compliance_admin"], label: "apcomp", countryIds: [sharedCountryId()] });
  note("api", `${attempt.result.status} ${attempt.result.text.slice(0, 140)}`);
  if (attempt.created) {
    register(w, attempt.created);
    anomaly(
      "MAJEUR (sécurité) : un admin_pays crée un compte compliance_admin (rôle supérieur au sien, droits de publication de consentements et d'activation de pays). " +
        "backend/src/modules/users/admin-users.controller.ts:232-241 canCreate : seul super_admin est exclu pour l'admin_pays (l.235). Correctif : liste blanche des rôles que l'admin_pays peut créer (rôles de son niveau ou inférieurs, hors compliance_admin, finance_admin, super_admin, admin_pays)."
    );
  }
  expect(attempt.result.status).toBe(403);
});

// ---------------------------------------------------------------------------------------------------------------------
// SEC-SELF-1 : actions d'un super admin sur lui-même
// ---------------------------------------------------------------------------------------------------------------------

const SELF_CAUSE =
  "backend/src/modules/users/admin-users.controller.ts:171-177 suspend, :187-193 lock, :211-217 delete et admin-user-roles.controller.ts:15-23 updateRoles : aucun contrôle « acteur == cible » ni « dernier super_admin actif ». " +
  "users.module.ts:219-225 suspend, :208-216 lock, :242-250 softDelete, :59-73 updateRoles. " +
  "Correctif : refuser (409/403) suspend, lock, delete et retrait de super_admin quand actor.actorId === userId, et refuser toute action qui laisserait zéro super_admin actif.";

test("SEC-SELF-1a un Super Admin jetable se suspend lui-même : API", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const token = await tokenOf(browser, w.accounts.s2);
  const attempt = await lifecycle(token, w.accounts.s2.id, "suspend");
  const after = await userRoles(sa, w.accounts.s2.id);
  const done = after.status === "suspended";
  note("api", `${attempt.status} ${attempt.text.slice(0, 120)} -> status ${after.status}`);
  try {
    if (done) {
      const still = await api(token, "GET", "/admin/users?page=1&pageSize=1");
      note("token after self-suspension", `GET /admin/users -> ${still.status}`);
      anomaly(`MAJEUR : un super_admin se suspend lui-même (HTTP ${attempt.status}). ${SELF_CAUSE}`);
    }
    expect(attempt.status, attempt.text).toBe(409);
    expect(rec(attempt.body).code).toBe("SELF_ACTION_FORBIDDEN");
    expect(done, "self-suspension must be refused").toBe(false);
  } finally {
    if (done) await lifecycle(sa, w.accounts.s2.id, "unsuspend");
  }
});

test("SEC-SELF-1b un Super Admin jetable s'auto-verrouille : API", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const token = await tokenOf(browser, w.accounts.s2);
  const attempt = await lifecycle(token, w.accounts.s2.id, "lock");
  const after = await userRoles(sa, w.accounts.s2.id);
  const done = after.status === "locked";
  note("api", `${attempt.status} ${attempt.text.slice(0, 120)} -> status ${after.status}`);
  try {
    if (done) anomaly(`MAJEUR : un super_admin s'auto-verrouille (HTTP ${attempt.status}). ${SELF_CAUSE}`);
    expect(attempt.status, attempt.text).toBe(409);
    expect(rec(attempt.body).code).toBe("SELF_ACTION_FORBIDDEN");
    expect(done, "self-lock must be refused").toBe(false);
  } finally {
    if (done) await lifecycle(sa, w.accounts.s2.id, "unlock");
  }
});

test("SEC-SELF-1c un Super Admin jetable retire son propre rôle super_admin : API", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const token = await tokenOf(browser, w.accounts.s2);
  const attempt = await roleUpdate(token, w.accounts.s2.id, ["content_admin"]);
  const after = await userRoles(sa, w.accounts.s2.id);
  const done = !after.roles.includes("super_admin");
  note("api", `${attempt.status} ${attempt.text.slice(0, 120)} -> roles ${after.roles.join("+")}`);
  try {
    if (done) anomaly(`MAJEUR : un super_admin retire son propre rôle super_admin (HTTP ${attempt.status}). ${SELF_CAUSE}`);
    expect(attempt.status, attempt.text).toBe(409);
    expect(rec(attempt.body).code).toBe("SELF_ACTION_FORBIDDEN");
    expect(done, "removing its own super_admin role must be refused").toBe(false);
  } finally {
    if (done) await roleUpdate(sa, w.accounts.s2.id, ["super_admin"]);
  }
});

test("SEC-SELF-1d un Super Admin jetable s'auto-supprime : API (compte S3, irréversible)", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const token = await tokenOf(browser, w.accounts.s3);
  const attempt = await api(token, "DELETE", `/admin/users/${w.accounts.s3.id}`, { reason: EDGE_REASON });
  const after = await userRoles(sa, w.accounts.s3.id);
  const done = after.status === "deleted";
  note("api", `${attempt.status} ${attempt.text.slice(0, 120)} -> status ${after.status} (S3 is throwaway: left deleted if it went through)`);
  if (done) anomaly(`MAJEUR : un super_admin s'auto-supprime (HTTP ${attempt.status}, compte S3 jetable laissé supprimé). ${SELF_CAUSE}`);
  expect(attempt.status, attempt.text).toBe(409);
  expect(rec(attempt.body).code).toBe("SELF_ACTION_FORBIDDEN");
  expect(done, "self-deletion must be refused").toBe(false);
});

// SEC-LAST-1 (409 LAST_SUPER_ADMIN) is not executed: the guard only answers once the target is the last ACTIVE super_admin of the
// whole stack, and only another active super_admin may act on a super_admin (self actions answer SELF_ACTION_FORBIDDEN first).
// Reaching that state means suspending the shared Super Admin of the scenario (used by every other runner and by the other lots),
// which would break them. It can be played on a throwaway stack only. SEC-SELF-1 above exercises the neighbouring guard.
test.skip("SEC-LAST-1 protection du dernier super admin : non exécuté (exigerait de suspendre le Super Admin partagé)", () => {
  // see the comment above
});

// ---------------------------------------------------------------------------------------------------------------------
// SEC-LEAK-1 : GET /admin/users ne renvoie aucun secret
// ---------------------------------------------------------------------------------------------------------------------

test("SEC-LEAK-1 GET /admin/users et /admin/users/:id : aucun secret (hash, secret MFA, codes de secours, jeton de reset)", async ({ browser }) => {
  const w = await world(browser);
  const token = await superToken(browser);
  const list = await api(token, "GET", "/admin/users?page=1&pageSize=100");
  expectStatus(list, 200, "list users");
  const detail = await api(token, "GET", `/admin/users/${w.accounts.su.id}`);
  expectStatus(detail, 200, "user detail");
  for (const result of [list, detail]) {
    expect(result.text, "no secret in the admin user views").not.toMatch(/passwordHash|mfaSecretEncrypted|mfaBackupCodesHashes|passwordResetTokenHash|mfaLastTotpCounter/u);
  }
  // A role without users:read (finance_admin) does not read the list either.
  const finance = await api(await tokenOf(browser, w.accounts.fa), "GET", "/admin/users?page=1&pageSize=5");
  note("finance_admin GET /admin/users", `${finance.status}`);
  expect([401, 403], finance.text.slice(0, 160)).toContain(finance.status);
});

// ---------------------------------------------------------------------------------------------------------------------
// T-01 : audit
// ---------------------------------------------------------------------------------------------------------------------

test("T-01 (utilisateurs) l'audit liste création, changement de rôle, refus avec acteur, cible et résultat", async ({ browser }) => {
  const w = await world(browser);
  const sa = await superToken(browser);
  const saId = await userIdByEmail(sa, sharedSuperAdmin().email);

  const entries = async (query: string): Promise<Array<Record<string, unknown>>> => {
    const result = await api(sa, "GET", `/admin/audit-logs?${query}&pageSize=200`);
    expectStatus(result, 200, `audit ${query}`);
    return itemsOfBody(result.body);
  };

  await expect
    .poll(async () => (await entries(`targetId=${w.targets.t1.id}`)).map((entry) => `${String(entry.action)}/${String(entry.result)}`).join(","), { timeout: 30_000, message: "audit of the first target" })
    .toContain("user.created/success");
  const forTarget = await entries(`targetId=${w.targets.t1.id}`);
  const created = forTarget.find((entry) => entry.action === "user.created");
  expect(String(rec(created).actorId), "user.created: actor is the Super Admin").toBe(saId);
  expect(String(rec(created).targetType)).toBe("User");

  // Attempts of the admin_pays on that target (SEC-ESC-1a): audited with actor, target and a result, refused or not.
  await expect
    .poll(async () => (await entries(`targetId=${w.targets.t1.id}&action=user.role_changed`)).length, { timeout: 30_000, message: "role change audited" })
    .toBeGreaterThan(0);
  const roleChanges = await entries(`targetId=${w.targets.t1.id}&action=user.role_changed`);
  for (const entry of roleChanges) {
    expect(entry.actorId, "role change: actor").toBeTruthy();
    expect(["success", "refused"]).toContain(String(entry.result));
  }
  expect(roleChanges.some((entry) => entry.actorId === w.accounts.ap.id), "an entry has the admin_pays as actor").toBe(true);
  note("role_changed by admin_pays on t1", roleChanges.filter((entry) => entry.actorId === w.accounts.ap.id).map((entry) => String(entry.result)).join(","));

  // Refused creation by the compliance_admin (E-P0-07c): result refused, actor, target "refused" and the e-mail in the context.
  await expect
    .poll(async () => (await entries(`actorId=${w.accounts.ca2.id}&action=user.created`)).length, { timeout: 30_000, message: "refused creation audited" })
    .toBeGreaterThan(0);
  const refused = await entries(`actorId=${w.accounts.ca2.id}&action=user.created`);
  expect(refused.every((entry) => entry.result === "refused")).toBe(true);

  // Suspension and the other lifecycle actions of the file.
  const suspended = await entries(`action=user.suspended&targetId=${w.accounts.s2.id}`);
  note("user.suspended on S2", `${suspended.length} entries`);

  // Screen: the audit page (compliance console) shows the same entries.
  const page = await openPage(browser, sharedSuperAdmin(), `/compliance/audit-logs?action=user.role_changed&targetId=${w.targets.t1.id}`);
  await expect(page.getByRole("row").filter({ hasText: "user.role_changed" }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------------------------------------------------
// Cleanup (always last)
// ---------------------------------------------------------------------------------------------------------------------

test("CLEANUP rôles restaurés et comptes jetables suspendus", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const report = await cleanup(browser);
  note("cleanup", report.join(" | "));
  expect(report.length).toBeGreaterThan(0);
});
