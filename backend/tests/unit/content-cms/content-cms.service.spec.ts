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
import { MemoryContentCmsRepository } from "../../../src/modules/content-cms/content-cms.repository";

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

  it("publishExclusively archives the previous published version in the same write", async () => {
    const { repository, service } = setup();
    const v1 = await service.create(author, { kind: "faq", entryKey: "devis-auto", locale: "fr", payload: FAQ });
    await service.submit(author, v1.id);
    await service.approve(compliance, v1.id, {});
    const v2 = await service.revise(author, v1.id);
    await service.submit(author, v2.id);
    await repository.publishExclusively(v2.id, new Date(), "x", null);
    const published = (await repository.list({ status: "published" }));
    expect(published.map((entry) => entry.id)).toEqual([v2.id]);
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
      for (const run of [
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
      ]) expect(await status(Promise.resolve().then(run)), role).toBe(403);
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
