import { expect, test } from "@playwright/test";
import type { BackOfficeAccount } from "./support/backoffice";
import { adminToken, adminWithRole, api, ensureAllowlisted, expectStatus, itemsOfBody, PARTNER_HTTPS_ORIGIN, rec } from "./support/admin-lot11";
import { loadJourneyState, requireState } from "./support/journey-state";
import { closeSessions } from "./support/pro-roles";
import { uniqueSuffix } from "./support/ui";
import { superAdminAccount } from "./support/world";

// Lot 11c, journey "Canaux et intégrations" (lot 10, spec 076), on the admin API (these routes have
// no screen):
//   CH-01 /admin/crm-connectors: a connector is created disabled, its signing secret is returned
//         once, a non-https URL is refused, an origin outside the partner allow-list is refused, a
//         second connector for the partner is a conflict, and support_admin is refused (403)
//   CH-02 GET /admin/messaging/outbox answers with metadata only; a role without audit access is refused
//   CH-03 sms_enabled, whatsapp_enabled, crm_connector_enabled, partner_api_enabled and partner_webhooks_enabled cannot be switched on with PATCH (403)
// No channel flag is opened here.

test.describe.configure({ mode: "serial" });

const suffix = uniqueSuffix();
const REASON = "Parcours E2E lot 11c - canaux";
const SENSITIVE_CHANNEL_FLAGS = ["sms_enabled", "whatsapp_enabled", "crm_connector_enabled", "partner_api_enabled", "partner_webhooks_enabled"] as const;

let superAdmin: BackOfficeAccount;
let support: BackOfficeAccount;
let contentAdmin: BackOfficeAccount;
let partnerId: string;

test.beforeAll(() => {
  superAdmin = superAdminAccount();
  partnerId = requireState(loadJourneyState(), "partnerId");
});

test.afterAll(async () => {
  await closeSessions();
});

test("CH-00 comptes support_admin et content_admin disponibles", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  support = await adminWithRole(browser, superAdmin, "support_admin", "support");
  contentAdmin = await adminWithRole(browser, superAdmin, "content_admin", "content");
});

test("CH-01 connecteurs CRM : création désactivée, URL non https refusée, rôle support refusé", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const token = await adminToken(browser, superAdmin);
  await ensureAllowlisted(token, partnerId, PARTNER_HTTPS_ORIGIN, REASON);
  const crmUrl = `${PARTNER_HTTPS_ORIGIN}/crm/assurmatch-${suffix}`;

  // Refusals first: nothing may be stored by them.
  const plainHttp = await api(token, "POST", "/admin/crm-connectors", {
    partnerTenantId: partnerId,
    name: `CRM E2E ${suffix}`,
    url: `http://example.com/crm/${suffix}`,
    eventTypes: ["lead.assigned"],
    reason: REASON
  });
  expectStatus(plainHttp, 400, "non-https CRM URL");

  const notAllowListed = await api(token, "POST", "/admin/crm-connectors", {
    partnerTenantId: partnerId,
    name: `CRM E2E ${suffix}`,
    url: `https://example.org/crm/${suffix}`,
    eventTypes: ["lead.assigned"],
    reason: REASON
  });
  expect(notAllowListed.status, `origin outside the allow-list -> ${notAllowListed.status} ${notAllowListed.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
  expect(notAllowListed.status).toBeLessThan(500);

  const supportToken = await adminToken(browser, support);
  const asSupport = await api(supportToken, "POST", "/admin/crm-connectors", {
    partnerTenantId: partnerId,
    name: `CRM E2E ${suffix}`,
    url: crmUrl,
    eventTypes: ["lead.assigned"],
    reason: REASON
  });
  expectStatus(asSupport, 403, "create CRM connector as support_admin");
  expectStatus(await api(supportToken, "GET", "/admin/crm-connectors"), 403, "list CRM connectors as support_admin");
  expectStatus(await api(supportToken, "GET", "/admin/crm-connectors/deliveries"), 403, "list CRM deliveries as support_admin");
  expectStatus(await api(undefined, "GET", "/admin/crm-connectors"), 401, "list CRM connectors without session");

  const listed = await api(token, "GET", "/admin/crm-connectors");
  expectStatus(listed, 200, "list CRM connectors");
  expect(itemsOfBody(listed.body).filter((entry) => entry.partnerTenantId === partnerId && String(entry.url).includes(suffix)), "refusals stored nothing").toHaveLength(0);

  // The happy path: created disabled, secret shown once, never listed afterwards.
  const existing = itemsOfBody(listed.body).find((entry) => entry.partnerTenantId === partnerId);
  if (existing) {
    // A kept stack already holds the connector of this partner (one per partner): the duplicate is a conflict.
    expectStatus(await api(token, "POST", "/admin/crm-connectors", { partnerTenantId: partnerId, name: `CRM E2E ${suffix}`, url: crmUrl, eventTypes: ["lead.assigned"], reason: REASON }), 409, "second CRM connector for the partner");
    expect(existing.status).not.toBe("active");
    return;
  }
  const created = await api(token, "POST", "/admin/crm-connectors", {
    partnerTenantId: partnerId,
    name: `CRM E2E ${suffix}`,
    url: crmUrl,
    eventTypes: ["lead.assigned", "lead.status_changed"],
    authHeaderName: "X-Partner-Token",
    authHeaderValue: `token-${suffix}`,
    reason: REASON
  });
  expectStatus(created, 201, "create CRM connector");
  const connector = rec(rec(created.body).connector);
  expect(connector.status, "created disabled").toBe("disabled");
  expect(connector.authHeaderConfigured).toBe(true);
  const signingSecret = String(rec(created.body).signingSecret ?? "");
  expect(signingSecret).toMatch(/^crmsec_/u);
  expect(created.text).not.toContain(`token-${suffix}`);

  const afterCreate = await api(token, "GET", "/admin/crm-connectors");
  expectStatus(afterCreate, 200, "list after create");
  expect(afterCreate.text, "the signing secret is shown once").not.toContain(signingSecret);
  expect(afterCreate.text, "the auth header value is never listed").not.toContain(`token-${suffix}`);
  const listedConnector = itemsOfBody(afterCreate.body).find((entry) => entry.id === connector.id);
  expect(listedConnector?.status).toBe("disabled");

  expectStatus(await api(token, "POST", "/admin/crm-connectors", { partnerTenantId: partnerId, name: `CRM bis ${suffix}`, url: crmUrl, eventTypes: ["lead.assigned"], reason: REASON }), 409, "second CRM connector for the partner");

  // Nothing is delivered while it is disabled: the delivery log stays empty for this connector.
  const deliveries = await api(token, "GET", `/admin/crm-connectors/deliveries?connectorId=${String(connector.id)}`);
  expectStatus(deliveries, 200, "CRM deliveries");
  expect(itemsOfBody(deliveries.body)).toHaveLength(0);
});

test("CH-02 GET /admin/messaging/outbox : métadonnées seulement, rôle sans accès audit refusé", async ({ browser }) => {
  const token = await adminToken(browser, superAdmin);
  const outbox = await api(token, "GET", "/admin/messaging/outbox");
  expectStatus(outbox, 200, "GET outbox as super_admin");
  const rows = Array.isArray(outbox.body) ? outbox.body : itemsOfBody(outbox.body);
  expect(Array.isArray(rows)).toBe(true);
  for (const row of rows) {
    const keys = Object.keys(rec(row));
    for (const forbidden of ["recipient", "recipientEncrypted", "body", "bodyEncrypted", "phone", "email"]) {
      expect(keys, `outbox row must not expose ${forbidden}`).not.toContain(forbidden);
    }
  }

  const contentToken = await adminToken(browser, contentAdmin);
  expectStatus(await api(contentToken, "GET", "/admin/messaging/outbox"), 403, "GET outbox as content_admin");
  expectStatus(await api(undefined, "GET", "/admin/messaging/outbox"), 401, "GET outbox without session");
});

test("CH-03 les 5 flags de canaux et d'API partenaire ne sont pas activables par PATCH", async ({ browser }) => {
  const token = await adminToken(browser, superAdmin);
  const flagsResponse = await api(token, "GET", "/admin/feature-flags");
  expectStatus(flagsResponse, 200, "list feature flags");
  const globalFlag = (key: string) => itemsOfBody(flagsResponse.body).find((flag) => flag.key === key && flag.scopeType === "global");

  // The reference seed persists some of these flags (a row to PATCH) and leaves others to their code default
  // (closed, no row): in both cases a PATCH cannot open them.
  let patched = 0;
  for (const key of SENSITIVE_CHANNEL_FLAGS) {
    const flag = globalFlag(key);
    if (flag) {
      expect(flag.value, `${key} starts closed`).toBe(false);
      const patch = await api(token, "PATCH", `/admin/feature-flags/${String(flag.id)}`, { value: true, reason: REASON });
      expectStatus(patch, 403, `PATCH ${key} value:true`);
      patched += 1;
    } else {
      const unknown = await api(token, "PATCH", `/admin/feature-flags/${crypto.randomUUID()}`, { value: true, reason: REASON });
      expect(unknown.status, `PATCH an unknown flag id for ${key} -> ${unknown.status}`).toBeGreaterThanOrEqual(400);
      expect(unknown.status).toBeLessThan(500);
    }
  }
  expect(patched, "every channel flag is persisted by the seed and was refused (403) by PATCH").toBe(SENSITIVE_CHANNEL_FLAGS.length);

  // Still closed after the refusals.
  const after = await api(token, "GET", "/admin/feature-flags");
  expectStatus(after, 200, "list feature flags after");
  for (const key of SENSITIVE_CHANNEL_FLAGS) {
    const flag = itemsOfBody(after.body).find((entry) => entry.key === key && entry.scopeType === "global");
    expect(flag?.value ?? false, `${key} still closed`).toBe(false);
  }
  expect(itemsOfBody(after.body).length, "no flag row was created by the refused PATCH calls").toBe(itemsOfBody(flagsResponse.body).length);
});
