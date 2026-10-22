import { afterEach, describe, expect, it } from "vitest";
import type { ContentCapabilitiesView, ContentEntryView, PublicContentResponse } from "../../../../packages/shared/contracts/content-cms.contracts";
import { AssurMatchRoles } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { ContentAuditActions } from "../../../src/modules/audit-logs/content-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const json = { "content-type": "application/json" };
const author: ActorContext = { actorId: "content-http-1", roles: ["content_admin"], mfaVerified: true, correlationId: "content-cms-http" };
const otherEditor: ActorContext = { actorId: "content-http-2", roles: ["content_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance-http", roles: ["compliance_admin"], mfaVerified: true };
const superAdmin: ActorContext = { actorId: "super-http", roles: ["super_admin"], mfaVerified: true };

const FAQ = { question: "Comment fonctionne une demande de devis auto ?", answer: "Vous remplissez un formulaire, puis un courtier partenaire agréé vous recontacte." };
const LEGAL = { sections: [{ id: "editeur", heading: "Éditeur", body: ["AssurMatch Sénégal est une plateforme technique de mise en relation."] }], placeholders: ["Numéro RCCM à compléter"] };
const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

describe("content CMS runtime HTTP (lot 9, spec 072)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function start(): Promise<RuntimeHttpHarness> {
    harness = await createRuntimeHttpHarness();
    return harness;
  }

  function call(active: RuntimeHttpHarness, actor: ActorContext | undefined, method: string, path: string, body?: unknown): Promise<Response> {
    return active.request(path, {
      method,
      headers: { ...(body === undefined ? {} : json), ...(actor ? actorHeaders(actor) : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  async function create(active: RuntimeHttpHarness, actor: ActorContext, body: Record<string, unknown>): Promise<ContentEntryView> {
    const response = await call(active, actor, "POST", "/admin/content/entries", body);
    expect(response.status).toBe(201);
    return readJson<ContentEntryView>(response);
  }

  async function publish(active: RuntimeHttpHarness, body: Record<string, unknown>, approver: ActorContext = compliance): Promise<ContentEntryView> {
    const entry = await create(active, author, body);
    expect((await call(active, author, "POST", `/admin/content/entries/${entry.id}/submit`)).status).toBe(200);
    const approved = await call(active, approver, "POST", `/admin/content/entries/${entry.id}/approve`, {});
    expect(approved.status).toBe(200);
    return readJson<ContentEntryView>(approved);
  }

  it("guards every admin route by role: content_admin and super_admin ok, compliance_admin read and decision only, the others 403", async () => {
    const active = await start();
    const draft = await create(active, author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    const base = "/admin/content";
    const e = `${base}/entries/${draft.id}`;
    const routes: Array<{ name: string; method: string; path: string; body?: unknown; level: "read" | "edit" | "approve" }> = [
      { name: "capabilities", method: "GET", path: `${base}/capabilities`, level: "read" },
      { name: "list", method: "GET", path: `${base}/entries`, level: "read" },
      { name: "detail", method: "GET", path: e, level: "read" },
      { name: "history", method: "GET", path: `${e}/history`, level: "read" },
      { name: "create", method: "POST", path: `${base}/entries`, body: { kind: "faq", entryKey: "autre-question", locale: "fr", payload: FAQ }, level: "edit" },
      { name: "update", method: "PUT", path: e, body: { payload: FAQ }, level: "edit" },
      { name: "submit", method: "POST", path: `${e}/submit`, level: "edit" },
      { name: "withdraw", method: "POST", path: `${e}/withdraw`, level: "edit" },
      { name: "approve", method: "POST", path: `${e}/approve`, body: {}, level: "approve" },
      { name: "reject", method: "POST", path: `${e}/reject`, body: { note: "non" }, level: "approve" },
      { name: "archive", method: "POST", path: `${e}/archive`, body: { note: "non" }, level: "approve" },
      { name: "revise", method: "POST", path: `${e}/revise`, level: "edit" }
    ];

    for (const route of routes) {
      // No authentication: 401. No MFA: refused.
      expect((await call(active, undefined, route.method, route.path, route.body)).status, `${route.name} anonymous`).toBe(401);
      const noMfa = await call(active, { ...author, mfaVerified: false }, route.method, route.path, route.body);
      expect([401, 403], `${route.name} without MFA`).toContain(noMfa.status);
      // Roles that never get in, reads included.
      for (const role of AssurMatchRoles.filter((candidate) => !["content_admin", "super_admin", "compliance_admin"].includes(candidate))) {
        const response = await call(active, { actorId: `http-${role}`, roles: [role], mfaVerified: true }, route.method, route.path, route.body);
        expect(response.status, `${route.name} ${role}`).toBe(403);
      }
      // Authorisation precedes parsing: a malformed id is a 403 for a denied role, not a 400.
      const malformed = route.path.replace(draft.id, "not-a-uuid");
      expect((await call(active, { actorId: "http-support", roles: ["support_admin"], mfaVerified: true }, route.method, malformed, route.body)).status, `${route.name} malformed id`).toBe(403);
      // compliance_admin: read and decision only.
      const complianceResponse = await call(active, compliance, route.method, route.path, route.body);
      if (route.level === "edit") expect(complianceResponse.status, `${route.name} compliance`).toBe(403);
      else expect(complianceResponse.status, `${route.name} compliance`).not.toBe(403);
    }

    expect(active.runtime.audit.writer.search({ action: ContentAuditActions.refused, result: "refused" }).length).toBeGreaterThan(0);
    // The capabilities tell the screen what the API accepts.
    expect(await readJson<ContentCapabilitiesView>(await call(active, compliance, "GET", `${base}/capabilities`))).toEqual({ canRead: true, canEdit: false, canApprove: true, canApproveLegal: true });
    expect(await readJson<ContentCapabilitiesView>(await call(active, author, "GET", `${base}/capabilities`))).toEqual({ canRead: true, canEdit: true, canApprove: true, canApproveLegal: false });
    expect((await call(active, superAdmin, "GET", `${base}/capabilities`)).status).toBe(200);
  });

  it("answers 400 on a malformed id for an authorised actor, 404 on an unknown entry, and no-store on admin responses", async () => {
    const active = await start();
    expect((await call(active, author, "GET", "/admin/content/entries/not-a-uuid")).status).toBe(400);
    expect((await call(active, author, "GET", `/admin/content/entries/${UNKNOWN_ID}`)).status).toBe(404);
    const response = await call(active, author, "GET", "/admin/content/entries");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await call(active, author, "GET", "/admin/content/entries?kind=video")).status).toBe(400);
  });

  it("runs the cycle with a second actor, never lets the submitter nor a content_admin approve a legal override", async () => {
    const active = await start();
    const draft = await create(active, author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    expect(draft.status).toBe("draft");
    expect((await call(active, author, "PUT", `/admin/content/entries/${draft.id}`, { payload: { ...FAQ, answer: "Réponse mise à jour par l'auteur." } })).status).toBe(200);
    expect((await call(active, author, "POST", `/admin/content/entries/${draft.id}/submit`)).status).toBe(200);
    // Own submission: refused, even for the author who holds content:approve.
    expect((await call(active, author, "POST", `/admin/content/entries/${draft.id}/approve`, {})).status).toBe(403);
    const approved = await call(active, otherEditor, "POST", `/admin/content/entries/${draft.id}/approve`, { note: "Relu et validé" });
    expect(approved.status).toBe(200);
    expect(await readJson<ContentEntryView>(approved)).toMatchObject({ status: "published", decidedById: "content-http-2" });

    const legal = await create(active, author, { kind: "legal_override", entryKey: "privacy", locale: "fr", countryCode: "SN", payload: LEGAL });
    await call(active, author, "POST", `/admin/content/entries/${legal.id}/submit`);
    expect((await call(active, author, "POST", `/admin/content/entries/${legal.id}/approve`, {})).status).toBe(403);
    expect((await call(active, otherEditor, "POST", `/admin/content/entries/${legal.id}/approve`, {})).status).toBe(403);
    expect((await call(active, compliance, "POST", `/admin/content/entries/${legal.id}/approve`, {})).status).toBe(200);

    const selfSuper = await create(active, superAdmin, { kind: "glossary", entryKey: "franchise", locale: "fr", payload: { term: "Franchise", definition: "Part du dommage restant à la charge de l'assuré." } });
    await call(active, superAdmin, "POST", `/admin/content/entries/${selfSuper.id}/submit`);
    expect((await call(active, superAdmin, "POST", `/admin/content/entries/${selfSuper.id}/approve`, {})).status).toBe(403);
    expect((await call(active, compliance, "POST", `/admin/content/entries/${selfSuper.id}/reject`, {})).status).toBe(400);
    expect((await call(active, compliance, "POST", `/admin/content/entries/${selfSuper.id}/reject`, { note: "À reprendre" })).status).toBe(200);
  });

  it("refuses markup (400), forbidden wording (422 FORBIDDEN_WORDING, audited), transitions out of order (409) and a second open version (409)", async () => {
    const active = await start();
    expect((await call(active, author, "POST", "/admin/content/entries", { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: { question: "Q ?", answer: "<script>alert(1)</script>" } })).status).toBe(400);
    const bad = await create(active, author, { kind: "faq", entryKey: "offre", locale: "fr", payload: { question: "Quelle offre ?", answer: "Vous pouvez acheter maintenant, c'est un contrat valide." } });
    const refused = await call(active, author, "POST", `/admin/content/entries/${bad.id}/submit`);
    expect(refused.status).toBe(422);
    expect((await readJson<{ code: string }>(refused)).code).toBe("FORBIDDEN_WORDING");
    expect(active.runtime.audit.writer.search({ action: ContentAuditActions.forbiddenWording })).toHaveLength(1);
    expect((await call(active, author, "POST", `/admin/content/entries/${bad.id}/approve`, {})).status).toBe(409);
    expect((await call(active, author, "POST", "/admin/content/entries", { kind: "faq", entryKey: "offre", locale: "fr", payload: FAQ })).status).toBe(409);
    expect((await call(active, author, "POST", `/admin/content/entries/${bad.id}/revise`)).status).toBe(409);
  });

  it("exposes only published content publicly, replaces a version atomically on revision, with the right headers", async () => {
    const active = await start();
    const publicRead = (query: string) => call(active, undefined, "GET", `/public-content${query}`);

    // Nothing published: empty, never an error.
    const empty = await publicRead("?locale=fr");
    expect(empty.status).toBe(200);
    expect(await readJson<PublicContentResponse>(empty)).toEqual({ locale: "fr", faq: [], guides: [], glossary: [], legal: {} });

    const v1 = await publish(active, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    await publish(active, { kind: "legal_override", entryKey: "privacy", locale: "fr", countryCode: "SN", payload: LEGAL });
    await publish(active, { kind: "faq", entryKey: "devis-auto", locale: "en", payload: { question: "How does a quote request work?", answer: "A partner broker calls you back." } });
    // Draft, pending and archived content stay invisible.
    await create(active, author, { kind: "faq", entryKey: "brouillon", locale: "fr", payload: FAQ });
    const pending = await create(active, author, { kind: "glossary", entryKey: "attente", locale: "fr", payload: { term: "Attente", definition: "Terme en attente." } });
    await call(active, author, "POST", `/admin/content/entries/${pending.id}/submit`);
    const old = await publish(active, { kind: "glossary", entryKey: "ancien", locale: "fr", payload: { term: "Ancien", definition: "Terme retiré." } });
    expect((await call(active, compliance, "POST", `/admin/content/entries/${old.id}/archive`, { note: "Obsolète" })).status).toBe(200);

    const response = await publicRead("?locale=fr&country=sn");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const body = await readJson<PublicContentResponse>(response);
    expect(body.faq).toHaveLength(1);
    expect(body.glossary).toEqual([]);
    expect(Object.keys(body.legal)).toEqual(["privacy"]);
    expect((await readJson<PublicContentResponse>(await publicRead("?locale=fr"))).legal).toEqual({});
    expect((await readJson<PublicContentResponse>(await publicRead("?locale=fr&country=CI"))).legal).toEqual({});
    expect((await readJson<PublicContentResponse>(await publicRead("?locale=en"))).faq[0]?.question).toBe("How does a quote request work?");
    expect((await readJson<PublicContentResponse>(await publicRead(""))).locale).toBe("fr");
    const dump = JSON.stringify(body);
    expect(dump).not.toMatch(/content-http|compliance-http|super-http|decidedById|createdById/);
    // Guard rail: no markup in any published string.
    expect(dump.replace(/"[^"]*":/g, "")).not.toMatch(/[<>]/);

    // Invalid query values are a 400.
    expect((await publicRead("?locale=de")).status).toBe(400);
    expect((await publicRead("?locale=fr&country=SEN")).status).toBe(400);

    // Revision: the published version stays online until the new one is approved, then swaps atomically.
    const v2 = await call(active, author, "POST", `/admin/content/entries/${v1.id}/revise`);
    expect(v2.status).toBe(200);
    const revised = await readJson<ContentEntryView>(v2);
    expect(revised).toMatchObject({ version: 2, status: "draft", basedOnId: v1.id });
    expect((await call(active, author, "PUT", `/admin/content/entries/${revised.id}`, { payload: { ...FAQ, answer: "Réponse de la version deux." } })).status).toBe(200);
    await call(active, author, "POST", `/admin/content/entries/${revised.id}/submit`);
    expect((await readJson<PublicContentResponse>(await publicRead("?locale=fr"))).faq[0]?.answer).toBe(FAQ.answer);
    expect((await call(active, compliance, "POST", `/admin/content/entries/${revised.id}/approve`, {})).status).toBe(200);
    const after = await readJson<PublicContentResponse>(await publicRead("?locale=fr"));
    expect(after.faq).toHaveLength(1);
    expect(after.faq[0]?.answer).toBe("Réponse de la version deux.");
    const history = await readJson<{ items: ContentEntryView[] }>(await call(active, author, "GET", `/admin/content/entries/${revised.id}/history`));
    expect(history.items.map((item) => [item.version, item.status])).toEqual([[2, "published"], [1, "archived"]]);
    const listed = await readJson<{ items: ContentEntryView[] }>(await call(active, author, "GET", "/admin/content/entries?status=published&locale=fr"));
    expect(listed.items.map((item) => item.status)).toEqual(["published", "published"]);
  });

  it("audits each step without ever copying the editorial text", async () => {
    const active = await start();
    const secret = { question: "Question avec marqueur unique QZX42 ?", answer: "Réponse avec marqueur unique QZX42 pour la relecture." };
    const entry = await publish(active, { kind: "faq", entryKey: "audit-test", locale: "fr", payload: secret });
    await call(active, author, "POST", `/admin/content/entries/${entry.id}/revise`);
    expect((await call(active, compliance, "POST", `/admin/content/entries/${entry.id}/archive`, { note: "Obsolète" })).status).toBe(200);
    const writer = active.runtime.audit.writer;
    for (const action of [ContentAuditActions.created, ContentAuditActions.submitted, ContentAuditActions.approved, ContentAuditActions.revised, ContentAuditActions.archived]) {
      expect(writer.search({ action, targetType: "ContentEntry" }).length, action).toBeGreaterThan(0);
    }
    const created = writer.search({ action: ContentAuditActions.created })[0];
    expect(created).toMatchObject({ targetType: "ContentEntry", result: "success", actorId: "content-http-1", scope: { kind: "faq", entryKey: "audit-test", locale: "fr", countryCode: null, version: 1 } });
    expect(JSON.stringify(writer.all())).not.toContain("QZX42");
  });
});
