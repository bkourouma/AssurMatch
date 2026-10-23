import { describe, expect, it } from "vitest";
import {
  contentDecisionSchema,
  contentEntryCreateSchema,
  contentReasonRequiredSchema,
  faqPayloadSchema,
  glossaryPayloadSchema,
  guidePayloadSchema,
  isPlainText,
  legalOverridePayloadSchema,
  validateContentScope
} from "../../../../packages/shared/contracts/content-cms.contracts";
import { AssurMatchRoles } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ContentAuditActions } from "../../../src/modules/audit-logs/content-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { collectPayloadStrings, ContentCmsService } from "../../../src/modules/content-cms/content-cms.service";
import {
  MemoryContentCmsRepository,
  OpenContentEntryExistsError,
  type ContentEntryGuard,
  type ContentEntryPatch,
  type ContentEntryRecord,
  type ContentPublication
} from "../../../src/modules/content-cms/content-cms.repository";

const author: ActorContext = { actorId: "content-1", roles: ["content_admin"], mfaVerified: true };
const secondEditor: ActorContext = { actorId: "content-2", roles: ["content_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true };
const superAdmin: ActorContext = { actorId: "super-1", roles: ["super_admin"], mfaVerified: true };

const FAQ = { question: "Comment fonctionne une demande de devis auto ?", answer: "Vous remplissez un formulaire, puis un courtier partenaire agréé vous recontacte." };
const GUIDE = {
  title: "Comprendre la franchise",
  description: "Ce que la franchise change au moment d'un sinistre.",
  sections: [{ id: "definition", heading: "Définition", body: ["La franchise est la part restant à votre charge."] }],
  keyPoints: ["Elle figure au contrat."],
  mistakes: ["Ne pas la comparer entre les offres."]
};
const GLOSSARY = { term: "Franchise", definition: "Part du dommage qui reste à la charge de l'assuré." };
const LEGAL = { sections: [{ id: "editeur", heading: "Éditeur", body: ["AssurMatch Sénégal est une plateforme technique de mise en relation."] }], placeholders: ["Numéro RCCM à compléter"] };

function setup() {
  const repository = new MemoryContentCmsRepository();
  const audit = new AuditLogWriter();
  let tick = Date.UTC(2026, 9, 22, 10, 0, 0);
  const service = new ContentCmsService({ audit, repository, now: () => new Date((tick += 1000)) });
  return { repository, audit, service };
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { getStatus?: () => number }).getStatus?.() ?? 500;
  }
}

describe("content CMS schemas (plain text only)", () => {
  it("refuses markup and control characters in every text of every kind", () => {
    expect(isPlainText("Texte simple\nsur deux lignes\tavec tabulation")).toBe(true);
    for (const bad of ["<script>alert(1)</script>", "<b>gras</b>", "a > b", "NUL\u0000", "bell\u0007", "esc\u001b[0m"]) {
      expect(isPlainText(bad), bad).toBe(false);
      expect(faqPayloadSchema.safeParse({ ...FAQ, answer: bad }).success, `faq ${bad}`).toBe(false);
      expect(glossaryPayloadSchema.safeParse({ ...GLOSSARY, definition: bad }).success, `glossary ${bad}`).toBe(false);
      expect(guidePayloadSchema.safeParse({ ...GUIDE, keyPoints: [bad] }).success, `guide ${bad}`).toBe(false);
      expect(legalOverridePayloadSchema.safeParse({ ...LEGAL, placeholders: [bad] }).success, `legal ${bad}`).toBe(false);
      expect(contentReasonRequiredSchema.safeParse({ note: bad }).success, `note ${bad}`).toBe(false);
      expect(contentDecisionSchema.safeParse({ note: bad }).success, `decision ${bad}`).toBe(false);
    }
    expect(faqPayloadSchema.safeParse(FAQ).success).toBe(true);
    expect(guidePayloadSchema.safeParse(GUIDE).success).toBe(true);
  });

  it("bounds lengths and requires a country only for a legal override", () => {
    expect(faqPayloadSchema.safeParse({ ...FAQ, answer: "x".repeat(4001) }).success).toBe(false);
    expect(validateContentScope({ kind: "legal_override", entryKey: "privacy", countryCode: "SN" })).toBeUndefined();
    expect(validateContentScope({ kind: "legal_override", entryKey: "privacy" })).toBeDefined();
    expect(validateContentScope({ kind: "legal_override", entryKey: "privacy", countryCode: "sn" })).toBeDefined();
    expect(validateContentScope({ kind: "legal_override", entryKey: "faq-page", countryCode: "SN" })).toBeDefined();
    expect(validateContentScope({ kind: "faq", entryKey: "devis-auto", countryCode: "SN" })).toBeDefined();
    expect(validateContentScope({ kind: "faq", entryKey: "Not A Slug" })).toBeDefined();
    expect(contentEntryCreateSchema.safeParse({ kind: "faq", entryKey: "devis-auto", locale: "de", payload: {} }).success).toBe(false);
  });
});

describe("ContentCmsService", () => {
  it("runs the whole cycle draft -> pending_review -> published, with a second actor", async () => {
    const { service, audit } = setup();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    expect(draft).toMatchObject({ status: "draft", version: 1, label: FAQ.question, createdById: "content-1", countryCode: null });
    const edited = await service.update(author, draft.id, { payload: { ...FAQ, answer: "Un courtier agréé vous recontacte après votre demande." } });
    expect(edited.payload).toMatchObject({ answer: "Un courtier agréé vous recontacte après votre demande." });
    const pending = await service.submit(author, draft.id);
    expect(pending).toMatchObject({ status: "pending_review", submittedById: "content-1" });
    const published = await service.approve(secondEditor, draft.id, { note: "Relu" });
    expect(published).toMatchObject({ status: "published", decidedById: "content-2", decisionNote: "Relu" });
    expect(published.publishedAt).not.toBeNull();
    const actions = audit.all().map((entry) => entry.action);
    expect(actions).toEqual([ContentAuditActions.created, ContentAuditActions.updated, ContentAuditActions.submitted, ContentAuditActions.approved]);
  });

  it("never records the editorial text in the audit trail", async () => {
    const { service, audit } = setup();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: { ...FAQ, answer: "Texte secret unique ZXQ" } });
    await service.submit(author, draft.id);
    await service.approve(superAdmin, draft.id, { note: "note interne confidentielle" });
    const dump = JSON.stringify(audit.all());
    expect(dump).not.toContain("ZXQ");
    expect(dump).not.toContain("Comment fonctionne");
    expect(dump).not.toContain("confidentielle");
    expect(audit.all()[0]?.scope).toMatchObject({ kind: "faq", entryKey: "devis-auto", locale: "fr", countryCode: null, version: 1 });
  });

  it("enforces four eyes: no self-approval, not even for super_admin, nor without an actor id", async () => {
    const { service, audit } = setup();
    const draft = await service.create(superAdmin, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    await service.submit(superAdmin, draft.id);
    expect(await status(service.approve(superAdmin, draft.id, {}))).toBe(403);
    expect(await status(service.approve({ roles: ["super_admin"], mfaVerified: true }, draft.id, {}))).toBe(403);
    expect((await service.get(superAdmin, draft.id)).status).toBe("pending_review");
    expect(audit.search({ action: ContentAuditActions.refused, result: "refused" }).length).toBeGreaterThanOrEqual(2);
    expect((await service.approve(compliance, draft.id, {})).status).toBe("published");
  });

  it("lets only compliance_admin or super_admin approve a legal override", async () => {
    const { service } = setup();
    const draft = await service.create(author, { kind: "legal_override", entryKey: "privacy", locale: "fr", countryCode: "SN", payload: LEGAL });
    expect(draft.countryCode).toBe("SN");
    await service.submit(author, draft.id);
    expect(await status(service.approve(secondEditor, draft.id, {}))).toBe(403);
    expect((await service.capabilities(secondEditor)).canApproveLegal).toBe(false);
    expect((await service.capabilities(compliance)).canApproveLegal).toBe(true);
    expect((await service.approve(compliance, draft.id, {})).status).toBe("published");
  });

  it("refuses forbidden wording at submission and at approval, audited, without the text", async () => {
    const { service, audit, repository } = setup();
    const bad = await service.create(author, { kind: "faq", entryKey: "offre", locale: "fr", payload: { ...FAQ, answer: "Vous pouvez acheter maintenant, c'est un contrat valide." } });
    await expect(service.submit(author, bad.id)).rejects.toMatchObject({ response: { code: "FORBIDDEN_WORDING" } });
    expect(await status(service.submit(author, bad.id))).toBe(422);
    const editorial = await service.create(author, { kind: "glossary", entryKey: "tarif", locale: "fr", payload: { term: "Tarif", definition: "Découvrez la meilleure offre du marché." } });
    expect(await status(service.submit(author, editorial.id))).toBe(422);
    expect(audit.search({ action: ContentAuditActions.forbiddenWording })).toHaveLength(3);
    expect(JSON.stringify(audit.all())).not.toContain("acheter maintenant");

    // A row altered after submission is still caught at approval.
    const sneaky = await service.create(author, { kind: "faq", entryKey: "sneaky", locale: "en", payload: { question: "How does a quote work?", answer: "A broker calls you back." } });
    await service.submit(author, sneaky.id);
    await repository.update(sneaky.id, { payload: { question: "How does a quote work?", answer: "Buy now, it is a valid contract." } });
    expect(await status(service.approve(compliance, sneaky.id, {}))).toBe(422);
    expect((await service.get(compliance, sneaky.id)).status).toBe("pending_review");
  });

  it("scans every nested string of the payload", async () => {
    expect(collectPayloadStrings(GUIDE)).toContain("Ne pas la comparer entre les offres.");
    const { service } = setup();
    const guide = await service.create(author, { kind: "guide", entryKey: "franchise", locale: "fr", payload: { ...GUIDE, mistakes: ["Penser que la garantie acceptée est automatique."] } });
    expect(await status(service.submit(author, guide.id))).toBe(422);
  });

  it("rejects with a mandatory reason, back to draft, and allows withdrawal", async () => {
    const { service } = setup();
    const draft = await service.create(author, { kind: "glossary", entryKey: "franchise", locale: "fr", payload: GLOSSARY });
    await service.submit(author, draft.id);
    expect(await status(service.reject(compliance, draft.id, {}))).toBe(400);
    const rejected = await service.reject(compliance, draft.id, { note: "Définition incomplète" });
    expect(rejected).toMatchObject({ status: "draft", decisionNote: "Définition incomplète" });
    await service.submit(author, draft.id);
    expect((await service.withdraw(author, draft.id)).status).toBe("draft");
  });

  it("refuses invalid transitions with 409", async () => {
    const { service } = setup();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    expect(await status(service.approve(compliance, draft.id, {}))).toBe(409);
    expect(await status(service.withdraw(author, draft.id))).toBe(409);
    expect(await status(service.reject(compliance, draft.id, { note: "non" }))).toBe(409);
    expect(await status(service.revise(author, draft.id))).toBe(409);
    await service.submit(author, draft.id);
    expect(await status(service.submit(author, draft.id))).toBe(409);
    expect(await status(service.update(author, draft.id, { payload: FAQ }))).toBe(409);
    await service.approve(compliance, draft.id, {});
    expect(await status(service.update(author, draft.id, { payload: FAQ }))).toBe(409);
    expect(await status(service.approve(superAdmin, draft.id, {}))).toBe(409);
    expect(await status(service.archive(compliance, draft.id, {}))).toBe(400);
    const archived = await service.archive(compliance, draft.id, { note: "Obsolète" });
    expect(archived.status).toBe("archived");
    expect(await status(service.archive(compliance, draft.id, { note: "Encore" }))).toBe(409);
    expect(await status(service.get(author, "11111111-1111-4111-8111-111111111111"))).toBe(404);
  });

  it("keeps at most one open version per key and one published version", async () => {
    const { service } = setup();
    const first = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    expect(await status(service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ }))).toBe(409);
    // The same key in the other locale is a distinct content.
    expect((await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "en", payload: { question: "How does a quote work?", answer: "A broker calls you back." } })).version).toBe(1);
    await service.submit(author, first.id);
    await service.approve(compliance, first.id, {});
    expect(await status(service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ }))).toBe(409);
  });

  it("revises a published entry: new draft version, old one stays online until the approval swaps them atomically", async () => {
    const { service } = setup();
    const v1 = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    await service.submit(author, v1.id);
    await service.approve(compliance, v1.id, {});

    const v2 = await service.revise(author, v1.id);
    expect(v2).toMatchObject({ status: "draft", version: 2, basedOnId: v1.id });
    expect(await status(service.revise(author, v1.id))).toBe(409);
    expect((await service.publicContent("fr")).faq).toHaveLength(1);
    expect((await service.publicContent("fr")).faq[0]?.answer).toBe(FAQ.answer);

    await service.update(author, v2.id, { payload: { ...FAQ, answer: "Réponse corrigée par la version deux." } });
    await service.submit(author, v2.id);
    expect((await service.publicContent("fr")).faq[0]?.answer).toBe(FAQ.answer);
    await service.approve(compliance, v2.id, {});

    const history = (await service.history(author, v2.id)).items;
    expect(history.map((entry) => [entry.version, entry.status])).toEqual([[2, "published"], [1, "archived"]]);
    const publicFaq = (await service.publicContent("fr")).faq;
    expect(publicFaq).toHaveLength(1);
    expect(publicFaq[0]?.answer).toBe("Réponse corrigée par la version deux.");
  });

  it("publishExclusively archives the previous published version in the same write, only when the guard still matches", async () => {
    const { repository, service } = setup();
    const v1 = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    await service.submit(author, v1.id);
    await service.approve(compliance, v1.id, {});
    const v2 = await service.revise(author, v1.id);
    await service.submit(author, v2.id);
    const pending = await repository.find(v2.id);
    const publication = { publishedAt: new Date(), decidedById: "x", note: null };
    // Stale read, or the approver is the submitter: nothing is written, the old version stays online.
    expect(await repository.publishExclusively(v2.id, { status: "pending_review", updatedAt: new Date(0), submittedByNot: "x" }, publication)).toBeUndefined();
    expect(await repository.publishExclusively(v2.id, { status: "pending_review", updatedAt: pending!.updatedAt, submittedByNot: "content-1" }, publication)).toBeUndefined();
    expect((await repository.list({ status: "published" })).map((entry) => entry.id)).toEqual([v1.id]);
    await repository.publishExclusively(v2.id, { status: "pending_review", updatedAt: pending!.updatedAt, submittedByNot: "x" }, publication);
    const published = (await repository.list({ status: "published" }));
    expect(published.map((entry) => entry.id)).toEqual([v2.id]);
  });

  it("refuses a second row with the same version of a key", async () => {
    const { repository, service } = setup();
    const v1 = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    const stored = await repository.find(v1.id);
    await expect(repository.create({ ...stored!, id: crypto.randomUUID(), status: "archived" })).rejects.toBeInstanceOf(OpenContentEntryExistsError);
  });

  it("projects only published entries of the requested locale, with no person identifier and no note", async () => {
    const { service } = setup();
    const publish = async (kind: "faq" | "guide" | "glossary" | "legal_override", entryKey: string, locale: "fr" | "en", payload: Record<string, unknown>, countryCode?: string) => {
      const entry = await service.create(author, { kind, entryKey, locale, payload, ...(countryCode ? { countryCode } : {}) });
      await service.submit(author, entry.id);
      await service.approve(superAdmin, entry.id, { note: "note interne" });
      return entry;
    };
    await publish("faq", "devis-auto", "fr", FAQ);
    await publish("guide", "franchise", "fr", GUIDE);
    await publish("glossary", "franchise", "fr", GLOSSARY);
    await publish("legal_override", "privacy", "fr", LEGAL, "SN");
    await publish("faq", "quote-en", "en", { question: "How does a quote work?", answer: "A broker calls you back." });
    // Not visible: a draft, a pending entry, an archived one.
    await service.create(author, { kind: "faq", entryKey: "brouillon", locale: "fr", payload: FAQ });
    const pending = await service.create(author, { kind: "faq", entryKey: "attente", locale: "fr", payload: FAQ });
    await service.submit(author, pending.id);
    const old = await publish("glossary", "ancien", "fr", { term: "Ancien", definition: "Terme retiré." });
    await service.archive(compliance, old.id, { note: "retiré" });

    const fr = await service.publicContent("fr", "SN");
    expect(fr.faq).toHaveLength(1);
    expect(fr.guides).toHaveLength(1);
    expect(fr.guides[0]).toMatchObject({ slug: "franchise", title: GUIDE.title });
    expect(fr.guides[0]?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fr.glossary.map((entry) => entry.term)).toEqual(["Franchise"]);
    expect(fr.legal.privacy?.sections[0]?.id).toBe("editeur");
    expect(Object.keys(fr.legal)).toEqual(["privacy"]);

    expect((await service.publicContent("fr")).legal).toEqual({});
    expect((await service.publicContent("fr", "CI")).legal).toEqual({});
    expect((await service.publicContent("en")).faq).toHaveLength(1);
    expect((await service.publicContent("en")).glossary).toEqual([]);

    const dump = JSON.stringify(fr);
    expect(dump).not.toMatch(/content-1|super-1|note interne|createdById|decidedById|submittedById/);
    // Guard rail: no markup can ever reach the public payload.
    for (const text of collectPayloadStrings(fr)) expect(text, text).not.toMatch(/[<>]/);
  });

  it("serves nothing from a stored payload that no longer satisfies the plain-text schema", async () => {
    const { service, repository } = setup();
    const entry = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    await service.submit(author, entry.id);
    await service.approve(compliance, entry.id, {});
    await repository.update(entry.id, { payload: { question: "Q ?", answer: "<script>alert(1)</script>" } });
    expect((await service.publicContent("fr")).faq).toEqual([]);
  });

  it("denies every role without the right permission, in reads as in writes, and audits it", async () => {
    const { service, audit } = setup();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    const denied = AssurMatchRoles.filter((role) => !["content_admin", "super_admin", "compliance_admin"].includes(role));
    for (const role of denied) {
      const actor: ActorContext = { actorId: `actor-${role}`, roles: [role], mfaVerified: true };
      const runs: Array<() => unknown> = [
        () => service.capabilities(actor),
        () => service.list(actor, {}),
        () => service.get(actor, draft.id),
        () => service.history(actor, draft.id),
        () => service.create(actor, { kind: "faq", entryKey: "x-key", locale: "fr", payload: FAQ }),
        () => service.update(actor, draft.id, { payload: FAQ }),
        () => service.submit(actor, draft.id),
        () => service.withdraw(actor, draft.id),
        () => service.approve(actor, draft.id, {}),
        () => service.reject(actor, draft.id, { note: "non" }),
        () => service.archive(actor, draft.id, { note: "non" }),
        () => service.revise(actor, draft.id)
      ];
      for (const run of runs) expect(await status(Promise.resolve().then(run) as Promise<unknown>), role).toBe(403);
    }
    expect(await status(service.list({ roles: [] }, {}))).toBe(403);
    expect(audit.search({ action: ContentAuditActions.refused, result: "refused" }).length).toBe(denied.length * 12 + 1);
  });

  it("gives compliance_admin read and approval but never creation, edition or submission", async () => {
    const { service } = setup();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    expect(await service.capabilities(compliance)).toEqual({ canRead: true, canEdit: false, canApprove: true, canApproveLegal: true });
    expect(await service.capabilities(author)).toEqual({ canRead: true, canEdit: true, canApprove: true, canApproveLegal: false });
    expect(await service.capabilities(superAdmin)).toEqual({ canRead: true, canEdit: true, canApprove: true, canApproveLegal: true });
    expect((await service.get(compliance, draft.id)).id).toBe(draft.id);
    expect(await status(service.create(compliance, { kind: "faq", entryKey: "autre", locale: "fr", payload: FAQ }))).toBe(403);
    expect(await status(service.update(compliance, draft.id, { payload: FAQ }))).toBe(403);
    expect(await status(service.submit(compliance, draft.id))).toBe(403);
    expect(await status(service.withdraw(compliance, draft.id))).toBe(403);
    expect(await status(service.revise(compliance, draft.id))).toBe(403);
  });

  it("validates before writing: bad scope, bad payload and unknown kinds are 400", async () => {
    const { service } = setup();
    expect(await status(service.create(author, { kind: "legal_override", entryKey: "privacy", locale: "fr", payload: LEGAL }))).toBe(400);
    expect(await status(service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: { question: "<b>Q</b>", answer: "R" } }))).toBe(400);
    expect(await status(service.create(author, { kind: "faq", entryKey: "Pas Un Slug", locale: "fr", payload: FAQ }))).toBe(400);
    expect(await status(service.create(author, { kind: "video", entryKey: "devis-auto", locale: "fr", payload: FAQ }))).toBe(400);
    expect((await service.list(author, {})).items).toEqual([]);
  });
});

type HeldMethod = "transition" | "publishExclusively";

/**
 * Memory repository that can pause the next write of a method AFTER the service has read and
 * checked the entry: the test then lands other writes, and releases the paused one. The guard is
 * evaluated when the paused write resumes, as the SQL WHERE is when a blocked UPDATE resumes.
 */
class InterleavingRepository extends MemoryContentCmsRepository {
  private readonly holds = new Map<HeldMethod, { reached: () => void; released: Promise<void> }>();

  holdNext(method: HeldMethod): { reached: Promise<void>; release: () => void } {
    let release!: () => void;
    let reached!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
    this.holds.set(method, { reached, released });
    return { reached: reachedPromise, release };
  }

  override async transition(id: string, guard: ContentEntryGuard, patch: ContentEntryPatch): Promise<ContentEntryRecord | undefined> {
    await this.wait("transition");
    return super.transition(id, guard, patch);
  }

  override async publishExclusively(id: string, guard: ContentEntryGuard, publication: ContentPublication): Promise<ContentEntryRecord | undefined> {
    await this.wait("publishExclusively");
    return super.publishExclusively(id, guard, publication);
  }

  private async wait(method: HeldMethod): Promise<void> {
    const hold = this.holds.get(method);
    if (!hold) return;
    this.holds.delete(method);
    hold.reached();
    await hold.released;
  }
}

describe("ContentCmsService under concurrent writes (conditional writes, four eyes in the write)", () => {
  function interleaved(now?: () => Date) {
    const repository = new InterleavingRepository();
    const audit = new AuditLogWriter();
    let tick = Date.UTC(2026, 9, 22, 10, 0, 0);
    const service = new ContentCmsService({ audit, repository, now: now ?? (() => new Date((tick += 1000))) });
    return { repository, audit, service };
  }

  function concurrentRefusals(audit: AuditLogWriter) {
    return audit.search({ action: ContentAuditActions.refused, result: "refused" }).filter((entry) => entry.reason === "concurrent_change");
  }

  async function pendingFaq(service: ContentCmsService, entryKey = "devis-auto") {
    const draft = await service.create(author, { kind: "faq", entryKey, locale: "fr", payload: FAQ });
    await service.submit(author, draft.id);
    return draft;
  }

  it("never publishes a text the approver did not review: withdraw + edit + resubmit by the approver during the approval", async () => {
    const { repository, audit, service } = interleaved();
    const entry = await pendingFaq(service);
    const hold = repository.holdNext("publishExclusively");
    const approval = status(service.approve(secondEditor, entry.id, {}));
    await hold.reached;
    // The approver takes the entry back, rewrites it and submits it as their own.
    await service.withdraw(secondEditor, entry.id);
    await service.update(secondEditor, entry.id, { payload: { ...FAQ, answer: "Texte jamais relu par un second acteur." } });
    await service.submit(secondEditor, entry.id);
    hold.release();

    expect(await approval).toBe(409);
    const stored = await service.get(compliance, entry.id);
    expect(stored).toMatchObject({ status: "pending_review", submittedById: "content-2", publishedAt: null });
    expect((await service.publicContent("fr")).faq).toEqual([]);
    expect(concurrentRefusals(audit)).toHaveLength(1);
    expect(audit.search({ action: ContentAuditActions.approved })).toHaveLength(0);
    // And the resubmitted text still needs another actor than its new submitter.
    expect(await status(service.approve(secondEditor, entry.id, {}))).toBe(403);
  });

  it("catches an intermediate rewrite by a third actor even when the clock does not move (updatedAt is the row version)", async () => {
    const frozen = new Date(Date.UTC(2026, 9, 22, 10, 0, 0));
    const { repository, audit, service } = interleaved(() => frozen);
    const entry = await pendingFaq(service);
    const hold = repository.holdNext("publishExclusively");
    const approval = status(service.approve(compliance, entry.id, {}));
    await hold.reached;
    // Another editor (not the approver) withdraws, rewrites and resubmits within the same millisecond.
    await service.withdraw(superAdmin, entry.id);
    await service.update(superAdmin, entry.id, { payload: { ...FAQ, answer: "Version réécrite que le relecteur n'a pas lue." } });
    await service.submit(superAdmin, entry.id);
    hold.release();

    expect(await approval).toBe(409);
    expect((await service.get(compliance, entry.id)).status).toBe("pending_review");
    expect((await service.publicContent("fr")).faq).toEqual([]);
    expect(concurrentRefusals(audit)).toHaveLength(1);
  });

  it("approve + withdraw at the same time: exactly one wins, the other is an audited 409", async () => {
    const { audit, service } = interleaved();
    const entry = await pendingFaq(service);
    const [approved, withdrawn] = await Promise.all([status(service.approve(compliance, entry.id, {})), status(service.withdraw(author, entry.id))]);
    expect([approved, withdrawn].sort()).toEqual([200, 409]);
    const stored = await service.get(compliance, entry.id);
    expect(stored.status).toBe(approved === 200 ? "published" : "draft");
    expect(concurrentRefusals(audit)).toHaveLength(1);
  });

  it("approve + reject at the same time: exactly one decision is recorded", async () => {
    const { audit, service } = interleaved();
    const entry = await pendingFaq(service);
    const [approved, rejected] = await Promise.all([status(service.approve(compliance, entry.id, {})), status(service.reject(superAdmin, entry.id, { note: "À reprendre" }))]);
    expect([approved, rejected].sort()).toEqual([200, 409]);
    const stored = await service.get(compliance, entry.id);
    if (approved === 200) expect(stored).toMatchObject({ status: "published", decidedById: "compliance-1", decisionNote: null });
    else expect(stored).toMatchObject({ status: "draft", decidedById: "super-1", decisionNote: "À reprendre" });
    expect(concurrentRefusals(audit)).toHaveLength(1);
  });

  it("double approval by two approvers: one publication, one audited 409", async () => {
    const { audit, service } = interleaved();
    const entry = await pendingFaq(service);
    const results = await Promise.all([status(service.approve(compliance, entry.id, {})), status(service.approve(superAdmin, entry.id, {}))]);
    expect(results.sort()).toEqual([200, 409]);
    expect(audit.search({ action: ContentAuditActions.approved })).toHaveLength(1);
    expect((await service.publicContent("fr")).faq).toHaveLength(1);
    expect(concurrentRefusals(audit)).toHaveLength(1);
  });

  it("a double approval racing on a revision never leaves two published versions nor archives the online one for nothing", async () => {
    const { repository, service } = interleaved();
    const v1 = await pendingFaq(service);
    await service.approve(compliance, v1.id, {});
    const v2 = await service.revise(author, v1.id);
    await service.update(author, v2.id, { payload: { ...FAQ, answer: "Réponse de la version deux." } });
    await service.submit(author, v2.id);
    const results = await Promise.all([status(service.approve(compliance, v2.id, {})), status(service.approve(superAdmin, v2.id, {}))]);
    expect(results.sort()).toEqual([200, 409]);
    expect((await repository.list({ status: "published" })).map((entry) => entry.id)).toEqual([v2.id]);
    expect((await repository.find(v1.id))?.status).toBe("archived");
  });

  it("an edit that read the draft before its submission is refused once the entry is pending review", async () => {
    const { repository, audit, service } = interleaved();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    const hold = repository.holdNext("transition");
    const edit = status(service.update(author, draft.id, { payload: { ...FAQ, answer: "Modification arrivée après la soumission." } }));
    await hold.reached;
    await service.submit(author, draft.id);
    hold.release();

    expect(await edit).toBe(409);
    const stored = await service.get(author, draft.id);
    expect(stored.status).toBe("pending_review");
    // The submitted (checked) text is the one under review, not the late edit.
    expect(stored.payload).toMatchObject({ answer: FAQ.answer });
    expect(concurrentRefusals(audit)).toHaveLength(1);
  });

  it("update and submit at the same time: never both, the stored text is the one the winner saw", async () => {
    const { service } = interleaved();
    const draft = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    const changed = { ...FAQ, answer: "Réponse changée en même temps que la soumission." };
    const [updated, submitted] = await Promise.all([status(service.update(author, draft.id, { payload: changed })), status(service.submit(author, draft.id))]);
    expect([updated, submitted].sort()).toEqual([200, 409]);
    const stored = await service.get(author, draft.id);
    if (submitted === 200) expect(stored).toMatchObject({ status: "pending_review", payload: { answer: FAQ.answer } });
    else expect(stored).toMatchObject({ status: "draft", payload: { answer: changed.answer } });
  });

  it("archive racing an approval of the next version: the published version is not archived twice", async () => {
    const { repository, service } = interleaved();
    const v1 = await pendingFaq(service);
    await service.approve(compliance, v1.id, {});
    const v2 = await service.revise(author, v1.id);
    await service.submit(author, v2.id);
    const hold = repository.holdNext("transition");
    const archiving = status(service.archive(compliance, v1.id, { note: "Obsolète" }));
    await hold.reached;
    expect((await service.approve(superAdmin, v2.id, {})).status).toBe("published");
    hold.release();
    // v1 was archived by the publication of v2 meanwhile: the late archive is a 409, v2 stays online.
    expect(await archiving).toBe(409);
    expect((await repository.list({ status: "published" })).map((entry) => entry.id)).toEqual([v2.id]);
  });

  it("refuses to approve a submission without a known submitter", async () => {
    const { repository, service } = interleaved();
    const entry = await pendingFaq(service);
    await repository.update(entry.id, { submittedById: null });
    expect(await status(service.approve(compliance, entry.id, {}))).toBe(403);
    expect((await service.get(compliance, entry.id)).status).toBe("pending_review");
  });
});
