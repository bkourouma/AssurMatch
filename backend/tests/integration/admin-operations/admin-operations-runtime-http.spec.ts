import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

/**
 * Spec 056: admin operations consoles over real Nest HTTP (H-01 to H-06): RBAC and MFA per route,
 * country scope, PII masking, persisted manual review, contact inbox status, audit-log search and
 * restricted export, routing history.
 */

const SUPER_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a001", roles: ["super_admin"], mfaVerified: true };
const COMPLIANCE_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a002", roles: ["compliance_admin"], mfaVerified: true };
const SUPPORT_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a003", roles: ["support_admin"], mfaVerified: true };
const ADMIN_PAYS_CI: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a004", roles: ["admin_pays"], countryScopes: ["CI"], mfaVerified: true };
const ADMIN_PAYS_SN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a005", roles: ["admin_pays"], countryScopes: ["SN"], mfaVerified: true };
const CONTENT_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a006", roles: ["content_admin"], mfaVerified: true };
const BROKER: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a007", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000b1", partnerPlan: "pro", mfaVerified: true };
const SUPER_ADMIN_NO_MFA: ActorContext = { ...SUPER_ADMIN, mfaVerified: false };

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

async function submitQuote(harness: RuntimeHttpHarness, seed: Seed, index: number): Promise<string> {
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: `Visiteur ${index}`, email: `visiteur${index}@example.com`, phone: `+22501020304${10 + index}` },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
      ipAddress: `203.0.113.${100 + index}`,
      sessionId: `admin-ops-session-${index}`
    })
  });
  expect(response.status).toBe(201);
  const confirmation = await readJson<{ publicReference: string }>(response);
  const quote = (await harness.runtime.quoteRequests.submissions.list()).find((candidate) => candidate.publicReference === confirmation.publicReference);
  if (!quote) throw new Error("submitted quote not found");
  return quote.id;
}

async function requireManualReview(harness: RuntimeHttpHarness, seed: Seed): Promise<void> {
  const product = await harness.runtime.products.service.require(seed.product.id);
  await harness.runtime.products.service.update(seed.product.id, {
    status: product.status,
    flags: { ...product.flags, product_manual_review_required: true },
    reason: "spec 056 manual review seed"
  }, seed.admin);
}

function get(harness: RuntimeHttpHarness, path: string, actor?: ActorContext) {
  return harness.request(path, actor ? { headers: actorHeaders(actor) } : undefined);
}

function post(harness: RuntimeHttpHarness, path: string, actor: ActorContext, body: unknown) {
  return harness.request(path, {
    method: "POST",
    headers: { ...actorHeaders(actor), "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("spec 056 admin operations consoles (runtime HTTP)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("keeps every console route behind authentication, MFA and the admin roles", async () => {
    harness = await createRuntimeHttpHarness();
    const routes = [
      "/admin/operations/quote-requests",
      "/admin/operations/quote-requests/00000000-0000-4000-8000-000000000001",
      "/admin/operations/quote-review",
      "/admin/operations/lead-assignments",
      "/admin/operations/audit-logs",
      "/admin/operations/audit-logs/export",
      "/admin/routing/history"
    ];
    for (const path of routes) {
      expect((await get(harness, path)).status, path).toBe(401);
      expect((await get(harness, path, SUPER_ADMIN_NO_MFA)).status, path).toBe(403);
      expect((await get(harness, path, BROKER)).status, path).toBe(403);
      expect((await get(harness, path, CONTENT_ADMIN)).status, path).toBe(403);
    }
    expect((await harness.request("/admin/contact-messages/00000000-0000-4000-8000-000000000001/status", { method: "POST" })).status).toBe(401);
    expect((await post(harness, "/admin/operations/quote-requests/00000000-0000-4000-8000-000000000001/review", BROKER, { decision: "non_routable", reason: "Motif de test suffisant" })).status).toBe(403);
  });

  it("lists and details quote requests with routing facts, scope and support masking (H-01)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const quoteId = await submitQuote(harness, seed, 1);

    const list = await get(harness, "/admin/operations/quote-requests?status=routed", SUPER_ADMIN);
    expect(list.status).toBe(200);
    const listRaw = await list.text();
    const page = JSON.parse(listRaw) as { items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: quoteId, countryCode: "CI", productKey: "auto", status: "routed", routingStatus: "assigned", assignmentCount: 1 });
    expect(listRaw).not.toContain("verificationTokenHash");
    expect(listRaw).not.toContain("visiteur1@example.com");

    const filtered = await readJson<{ total: number }>(await get(harness, "/admin/operations/quote-requests?status=manual_review", SUPER_ADMIN));
    expect(filtered.total).toBe(0);
    expect((await get(harness, "/admin/operations/quote-requests?status=not_a_status", SUPER_ADMIN)).status).toBe(400);

    const detail = await readJson<{
      consent: { status: string; intendedRecipient: string };
      contact: { email: string; phone: string };
      answers: Record<string, unknown>;
      routingDecisions: Array<{ result: string; selectedPartners: Array<{ legalName: string }> }>;
      assignments: Array<{ partnerLegalName: string; status: string }>;
      piiMasked: boolean;
      reviewOpen: boolean;
    }>(await get(harness, `/admin/operations/quote-requests/${quoteId}`, SUPER_ADMIN));
    expect(detail.consent.status).toBe("granted");
    expect(detail.contact.email).toBe("visiteur1@example.com");
    expect(detail.answers).toEqual({ vehicle_use: "prive" });
    expect(detail.routingDecisions[0]).toMatchObject({ result: "assigned" });
    expect(detail.routingDecisions[0]?.selectedPartners[0]?.legalName).toBe("Broker CI Runtime");
    expect(detail.assignments[0]).toMatchObject({ partnerLegalName: "Broker CI Runtime" });
    expect(detail.piiMasked).toBe(false);
    expect(detail.reviewOpen).toBe(false);

    const supportResponse = await get(harness, `/admin/operations/quote-requests/${quoteId}`, SUPPORT_ADMIN);
    expect(supportResponse.status).toBe(200);
    const supportRaw = await supportResponse.text();
    expect(supportRaw).not.toContain("visiteur1@example.com");
    expect(supportRaw).not.toContain("prive");
    const supportDetail = JSON.parse(supportRaw) as { piiMasked: boolean; answers: Record<string, unknown> };
    expect(supportDetail.piiMasked).toBe(true);
    expect(supportDetail.answers).toEqual({ vehicle_use: "[masque]" });

    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/quote-requests", ADMIN_PAYS_CI))).total).toBe(1);
    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/quote-requests", ADMIN_PAYS_SN))).total).toBe(0);
    expect((await get(harness, `/admin/operations/quote-requests/${quoteId}`, ADMIN_PAYS_SN)).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "admin_operations.access_refused", targetId: quoteId }).some((entry) => entry.reason === "out_of_scope")).toBe(true);
    expect(harness.runtime.audit.writer.search({ action: "admin_operations.quote_request_viewed", targetId: quoteId }).length).toBeGreaterThanOrEqual(2);

    // The legacy listing no longer carries the verification token hash or the answers.
    const legacy = await get(harness, "/admin/quote-requests", SUPER_ADMIN);
    expect(legacy.status).toBe(200);
    const legacyRaw = await legacy.text();
    expect(legacyRaw).not.toContain("verificationTokenHash");
    expect(legacyRaw).not.toContain("vehicle_use");
    expect(JSON.parse(legacyRaw)).toHaveLength(1);
  });

  it("persists manual review decisions with audit, consent gate and conflicts (H-02)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await requireManualReview(harness, seed);
    const routeId = await submitQuote(harness, seed, 2);
    const nonRoutableId = await submitQuote(harness, seed, 3);
    const duplicateId = await submitQuote(harness, seed, 4);
    const withdrawnId = await submitQuote(harness, seed, 5);
    const assignId = await submitQuote(harness, seed, 6);

    const queue = await readJson<{ total: number; items: Array<{ id: string; candidates: Array<{ legalName: string; eligible: boolean }> }> }>(
      await get(harness, "/admin/operations/quote-review", SUPPORT_ADMIN)
    );
    expect(queue.total).toBe(5);
    expect(queue.items[0]?.candidates.some((candidate) => candidate.legalName === "Broker CI Runtime" && candidate.eligible)).toBe(true);

    // Support reads but never decides; compliance may close but not transmit.
    expect((await post(harness, `/admin/operations/quote-requests/${routeId}/review`, SUPPORT_ADMIN, { decision: "non_routable", reason: "Demande hors cible support" })).status).toBe(403);
    expect((await post(harness, `/admin/operations/quote-requests/${routeId}/review`, COMPLIANCE_ADMIN, { decision: "route", reason: "Validation conformite ok" })).status).toBe(403);
    expect((await post(harness, `/admin/operations/quote-requests/${routeId}/review`, ADMIN_PAYS_SN, { decision: "route", reason: "Hors perimetre pays" })).status).toBe(403);
    expect((await post(harness, `/admin/operations/quote-requests/${routeId}/review`, SUPER_ADMIN, { decision: "route", reason: "court" })).status).toBe(400);

    const routed = await post(harness, `/admin/operations/quote-requests/${routeId}/review`, ADMIN_PAYS_CI, { decision: "route", reason: "Revue manuelle validee par l'admin pays" });
    expect(routed.status).toBe(200);
    expect(await readJson<{ status: string; routingStatus: string; assignmentIds: string[] }>(routed)).toMatchObject({ status: "routed", routingStatus: "assigned" });
    const persisted = await harness.runtime.quoteRequests.submissions.findById(routeId);
    expect(persisted).toMatchObject({ status: "routed", routingStatus: "assigned", reviewedById: ADMIN_PAYS_CI.actorId, manualReviewReason: "Revue manuelle validee par l'admin pays" });
    expect(persisted?.reviewedAt).toBeInstanceOf(Date);
    expect((await harness.runtime.leads.assignments.list()).filter((assignment) => assignment.quoteRequestId === routeId)).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: "admin_operations.quote_review_decided", targetId: routeId })).toHaveLength(1);
    // Spec 054 steps: "in review" at submission, then one "transmitted" e-mail per assignment.
    const visitorTypesFor = async (quoteId: string) => (await harness!.runtime.notifications.service.list())
      .filter((notification) => notification.payloadReference === quoteId && notification.type.startsWith("visitor_"))
      .map((notification) => notification.type);
    expect(await visitorTypesFor(routeId)).toEqual(["visitor_quote_in_review", "visitor_quote_transmitted"]);

    // A closed review cannot be decided twice.
    expect((await post(harness, `/admin/operations/quote-requests/${routeId}/review`, SUPER_ADMIN, { decision: "non_routable", reason: "Deuxieme decision refusee" })).status).toBe(409);

    const nonRoutable = await post(harness, `/admin/operations/quote-requests/${nonRoutableId}/review`, COMPLIANCE_ADMIN, { decision: "non_routable", reason: "Risque hors appetit des courtiers" });
    expect(nonRoutable.status).toBe(200);
    expect(await harness.runtime.quoteRequests.submissions.findById(nonRoutableId)).toMatchObject({ status: "non_routable", routingStatus: "blocked", refusalReason: "admin_review_non_routable", reviewedById: COMPLIANCE_ADMIN.actorId });
    expect(await visitorTypesFor(nonRoutableId)).toEqual(["visitor_quote_in_review", "visitor_quote_non_routable"]);
    expect((await harness.runtime.leads.decisions.list()).some((decision) => decision.quoteRequestId === nonRoutableId && decision.result === "blocked" && decision.reasons.includes("admin_review_non_routable"))).toBe(true);

    const routedReference = (await harness.runtime.quoteRequests.submissions.findById(routeId))?.publicReference;
    expect((await post(harness, `/admin/operations/quote-requests/${duplicateId}/review`, SUPER_ADMIN, { decision: "duplicate", reason: "Doublon de la demande precedente", duplicateOfReference: "QR-0000-UNKNOWN" })).status).toBe(404);
    const duplicate = await post(harness, `/admin/operations/quote-requests/${duplicateId}/review`, SUPER_ADMIN, { decision: "duplicate", reason: "Doublon de la demande precedente", duplicateOfReference: routedReference });
    expect(duplicate.status).toBe(200);
    expect(await harness.runtime.quoteRequests.submissions.findById(duplicateId)).toMatchObject({ status: "duplicate", duplicateStatus: "blocked_duplicate", duplicateOfQuoteRequestId: routeId });
    expect(await visitorTypesFor(duplicateId)).toEqual(["visitor_quote_in_review"]);

    // SC-09: a withdrawn consent is never routed by a review, and the refusal is audited.
    const withdrawn = await harness.runtime.quoteRequests.submissions.findById(withdrawnId);
    await harness.runtime.consent.service.withdraw(withdrawn!.consentRecordId, SUPER_ADMIN, "spec 056 consent gate");
    const refused = await post(harness, `/admin/operations/quote-requests/${withdrawnId}/review`, SUPER_ADMIN, { decision: "route", reason: "Tentative de routage sans consentement" });
    expect(refused.status).toBe(422);
    expect(harness.runtime.audit.writer.search({ action: "admin_operations.quote_review_refused", targetId: withdrawnId }).some((entry) => entry.reason === "consent_withdrawn")).toBe(true);
    expect((await harness.runtime.leads.assignments.list()).some((assignment) => assignment.quoteRequestId === withdrawnId)).toBe(false);
    expect(await harness.runtime.quoteRequests.submissions.findById(withdrawnId)).toMatchObject({ status: "manual_review" });

    const assigned = await post(harness, `/admin/operations/quote-requests/${assignId}/review`, SUPER_ADMIN, { decision: "assign", partnerTenantId: seed.partner.id, reason: "Assignation manuelle au courtier eligible" });
    expect(assigned.status).toBe(200);
    expect(await harness.runtime.quoteRequests.submissions.findById(assignId)).toMatchObject({ status: "routed", routingStatus: "assigned", reviewedById: SUPER_ADMIN.actorId });

    const remaining = await readJson<{ total: number }>(await get(harness, "/admin/operations/quote-review", SUPER_ADMIN));
    expect(remaining.total).toBe(1);
  });

  it("lists lead assignments without contact data, scoped by country (H-03)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const quoteId = await submitQuote(harness, seed, 7);

    const response = await get(harness, `/admin/operations/lead-assignments?status=assigned&quoteRequestId=${quoteId}`, ADMIN_PAYS_CI);
    expect(response.status).toBe(200);
    const raw = await response.text();
    const page = JSON.parse(raw) as { total: number; items: Array<Record<string, unknown>> };
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ quoteRequestId: quoteId, countryCode: "CI", productKey: "auto", partnerLegalName: "Broker CI Runtime" });
    expect(Object.keys(page.items[0] ?? {})).not.toContain("contact");
    expect(raw).not.toContain("visiteur7@example.com");
    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/lead-assignments", ADMIN_PAYS_SN))).total).toBe(0);
    const legacyRaw = await (await get(harness, "/admin/lead-assignments", SUPER_ADMIN)).text();
    expect(legacyRaw).not.toContain("visiteur7@example.com");
  });

  it("moves a contact message between new, handled and spam with audit (H-04)", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await harness.request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.90" },
      body: JSON.stringify({
        audience: "visitor",
        name: "Awa Kone",
        email: "awa.kone@example.com",
        subject: "Question sur ma demande",
        message: "Bonjour, je souhaite savoir ou en est ma demande de devis.",
        consent: true
      })
    });
    const [message] = await readJson<Array<{ id: string; status: string }>>(await get(harness, "/admin/contact-messages", SUPPORT_ADMIN));
    expect(message?.status).toBe("new");

    expect((await post(harness, `/admin/contact-messages/${message!.id}/status`, BROKER, { status: "handled" })).status).toBe(403);
    expect((await post(harness, `/admin/contact-messages/${message!.id}/status`, ADMIN_PAYS_CI, { status: "handled" })).status).toBe(403);
    expect((await post(harness, `/admin/contact-messages/${message!.id}/status`, SUPPORT_ADMIN, { status: "archived" })).status).toBe(400);
    expect((await post(harness, "/admin/contact-messages/00000000-0000-4000-8000-000000000009/status", SUPPORT_ADMIN, { status: "handled" })).status).toBe(404);

    const handled = await post(harness, `/admin/contact-messages/${message!.id}/status`, SUPPORT_ADMIN, { status: "handled", reason: "Reponse envoyee par e-mail" });
    expect(handled.status).toBe(200);
    expect(await readJson<{ status: string; previousStatus: string; handledById: string }>(handled)).toMatchObject({ status: "handled", previousStatus: "new", handledById: SUPPORT_ADMIN.actorId });
    const [afterHandled] = await readJson<Array<{ status: string }>>(await get(harness, "/admin/contact-messages?status=handled", SUPPORT_ADMIN));
    expect(afterHandled?.status).toBe("handled");

    const spam = await post(harness, `/admin/contact-messages/${message!.id}/status`, COMPLIANCE_ADMIN, { status: "spam" });
    expect(spam.status).toBe(200);
    const audits = harness.runtime.audit.writer.search({ action: "contact_message.status_updated", targetId: message!.id });
    expect(audits.map((entry) => entry.context.status)).toEqual(["handled", "spam"]);
    expect(JSON.stringify(audits)).not.toContain("je souhaite savoir");
    expect(harness.runtime.audit.writer.search({ action: "contact_message.status_update_refused", targetId: message!.id })).toHaveLength(2);
  });

  it("searches audit logs with filters and pagination, and restricts the export (H-05)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await submitQuote(harness, seed, 8);

    const first = await readJson<{ items: Array<{ action: string; occurredAt: string }>; total: number; page: number; pageSize: number }>(
      await get(harness, "/admin/operations/audit-logs?action=quote_request&pageSize=1", SUPPORT_ADMIN)
    );
    expect(first.pageSize).toBe(1);
    expect(first.items).toHaveLength(1);
    expect(first.total).toBeGreaterThanOrEqual(1);
    expect(first.items.every((item) => item.action.startsWith("quote_request"))).toBe(true);

    const refusedOnly = await readJson<{ items: Array<{ result: string }> }>(await get(harness, "/admin/operations/audit-logs?result=refused", COMPLIANCE_ADMIN));
    expect(refusedOnly.items.every((item) => item.result === "refused")).toBe(true);
    const future = await readJson<{ total: number }>(await get(harness, "/admin/operations/audit-logs?from=2999-01-01", SUPER_ADMIN));
    expect(future.total).toBe(0);
    expect((await get(harness, "/admin/operations/audit-logs?from=not-a-date", SUPER_ADMIN)).status).toBe(400);
    expect((await get(harness, "/admin/operations/audit-logs?pageSize=500", SUPER_ADMIN)).status).toBe(400);

    // The bare-array route reads the same durable store and accepts the same filters.
    const legacy = await readJson<Array<{ action: string }>>(await get(harness, "/admin/audit-logs?action=quote_request.created", SUPER_ADMIN));
    expect(legacy.length).toBeGreaterThanOrEqual(1);
    expect(legacy.every((item) => item.action === "quote_request.created")).toBe(true);

    expect((await get(harness, "/admin/operations/audit-logs/export", SUPPORT_ADMIN)).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "audit_log.export_refused" })).toHaveLength(1);
    const exported = await get(harness, "/admin/operations/audit-logs/export?action=quote_request", COMPLIANCE_ADMIN);
    expect(exported.status).toBe(200);
    const csv = await readJson<{ csv: string; rowCount: number; truncated: boolean; fileName: string; contentType: string }>(exported);
    expect(csv.contentType).toBe("text/csv; charset=utf-8");
    expect(csv.fileName).toMatch(/^audit-logs-.*\.csv$/);
    expect(csv.csv.split("\r\n")[0]).toBe("occurredAt,actorId,action,targetType,targetId,result,reason,correlationId,scope,context");
    expect(csv.rowCount).toBeGreaterThanOrEqual(1);
    expect(csv.truncated).toBe(false);
    const exportAudit = harness.runtime.audit.writer.search({ action: "audit_log.exported" });
    expect(exportAudit).toHaveLength(1);
    expect(exportAudit[0]?.context).toMatchObject({ rowCount: csv.rowCount, filters: { action: "quote_request" } });
  });

  it("exposes the routing decision history with partner names (H-06)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const quoteId = await submitQuote(harness, seed, 9);

    const response = await get(harness, "/admin/routing/history?result=assigned", SUPPORT_ADMIN);
    expect(response.status).toBe(200);
    const page = await readJson<{ total: number; items: Array<{ quoteRequestId: string; countryCode: string; selectedPartners: Array<{ legalName: string }> }> }>(response);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ quoteRequestId: quoteId, countryCode: "CI" });
    expect(page.items[0]?.selectedPartners[0]?.legalName).toBe("Broker CI Runtime");
    expect((await readJson<{ total: number }>(await get(harness, "/admin/routing/history", ADMIN_PAYS_SN))).total).toBe(0);
    expect((await get(harness, "/admin/routing/anomalies", SUPPORT_ADMIN)).status).toBe(200);
  });
});
