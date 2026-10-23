import { describe, expect, it } from "vitest";
import { findForbiddenWording, findForbiddenWordingAnyLanguage, stripControlCharacters } from "../../../../packages/shared/contracts/content-safety";
import {
  DOCUMENT_REQUEST_LABEL_MAX,
  LEAD_MESSAGE_BODY_MAX,
  LEAD_MESSAGE_PAGE_SIZE,
  LEAD_MESSAGE_THREAD_MAX,
  adminLeadConversationsViewSchema,
  brokerLeadMessageCreateSchema,
  documentRequestCreateSchema,
  leadConversationQuerySchema,
  leadMessageCreateSchema,
  leadMessagingNotice
} from "../../../../packages/shared/contracts/lead-messaging";
import {
  DATA_REQUEST_DETAIL_MAX,
  adminDataRequestDetailSchema,
  adminDataRequestListItemSchema,
  canTransitionDataRequest,
  dataRequestCompleteSchema,
  dataRequestCreateSchema,
  dataRequestRejectSchema,
  isDataRequestReference
} from "../../../../packages/shared/contracts/data-requests";
import { publicQuoteStatusViewSchema } from "../../../../packages/shared/contracts/public-quote-status";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { notificationSchema } from "../../../../packages/shared/contracts/ops.contracts";

describe("forbidden wording guard (spec 062 R4)", () => {
  it("blocks accented and unaccented forms of the regulated promises", () => {
    expect(findForbiddenWordingAnyLanguage("Votre contrat validé est prêt")).toEqual(["contrat valide"]);
    expect(findForbiddenWordingAnyLanguage("CONTRAT VALIDÉ")).toEqual(["contrat valide"]);
    expect(findForbiddenWordingAnyLanguage("contrat valide")).toEqual(["contrat valide"]);
    expect(findForbiddenWordingAnyLanguage("Garantie acceptée sous 24 h")).toEqual(["garantie acceptée"]);
    expect(findForbiddenWordingAnyLanguage("garantie acceptee")).toEqual(["garantie acceptee"]);
    expect(findForbiddenWordingAnyLanguage("Souscrire  maintenant")).toEqual(["souscrire maintenant"]);
    expect(findForbiddenWordingAnyLanguage("Souscrivez maintenant, achetez maintenant")).toEqual(["achetez maintenant", "souscrivez maintenant"]);
  });

  it("blocks « garanti » used as a promise (closed list of phrases), whatever the gender, number and accents", () => {
    expect(findForbiddenWordingAnyLanguage("Remboursement garanti")).toEqual(["remboursement garanti"]);
    expect(findForbiddenWordingAnyLanguage("Tarifs GARANTIS à vie")).toEqual(["garanti à vie", "tarif garanti"]);
    expect(findForbiddenWordingAnyLanguage("Un prix garanti.")).toEqual(["prix garanti"]);
    expect(findForbiddenWordingAnyLanguage("Prix garantis")).toEqual(["prix garanti"]);
    expect(findForbiddenWordingAnyLanguage("Une acceptation garantie")).toEqual(["acceptation garantie"]);
    expect(findForbiddenWordingAnyLanguage("Réponse garantie sous 24 h")).toEqual(["réponse garantie"]);
    expect(findForbiddenWordingAnyLanguage("reponse garantie")).toEqual(["réponse garantie"]);
    expect(findForbiddenWordingAnyLanguage("Devis garanti, résultat garanti")).toEqual(["résultat garanti", "devis garanti"]);
    expect(findForbiddenWordingAnyLanguage("Un contrat garanti")).toEqual(["contrat garanti"]);
    expect(findForbiddenWordingAnyLanguage("C'est 100 % garanti")).toEqual(["100 % garanti"]);
    expect(findForbiddenWordingAnyLanguage("100% garanti")).toEqual(["100 % garanti"]);
    expect(findForbiddenWordingAnyLanguage("Offre garantie sans condition")).toEqual(["garanti sans condition", "offre garantie"]);
    expect(findForbiddenWordingAnyLanguage("Garanti sans condition")).toEqual(["garanti sans condition"]);
    expect(findForbiddenWordingAnyLanguage("Garantie à vie")).toEqual(["garanti à vie"]);
  });

  it("never blocks the ordinary technical wording or the nouns garantie / garanties", () => {
    for (const text of [
      "Les risques garantis sont listés ci-dessous",
      "Capital garanti en cas de décès",
      "Les dommages garantis incluent le vol",
      "Voici les garanties incluses",
      "Les garanties incluses et la garantie décès",
      "Voici le détail des garanties et de la garantie décès",
      "Niveau de garantie : standard",
      "garantissent",
      "Les événements garantis par le contrat",
      "Le franchise garantie est précisée dans vos conditions"
    ]) {
      expect(findForbiddenWordingAnyLanguage(text), text).toEqual([]);
    }
  });

  it("is not fooled by zero-width, soft-hyphen, bidi, no-break space, full-width, hyphen or dot separators", () => {
    const evasions = [
      "Rembour\u200Bsement gar\u200Danti",
      "Remboursement garan\u00ADti",
      "Prix\u00A0garanti",
      "Prix\u202Fgaranti",
      "Prix\u2060 garanti\uFEFF",
      "Prix\u200E garanti",
      "ｒｅｍｂｏｕｒｓｅｍｅｎｔ ｇａｒａｎｔｉ",
      "remboursement-garanti",
      "remboursement_garanti",
      "remboursement.garanti",
      "remboursement\u2013garanti",
      "REMBOURSEMENT   GARANTI",
      "Remboursement\ngaranti",
      "garantI\u0301 à vie",
      "g\u0336a\u0336r\u0336a\u0336n\u0336t\u0336i\u0336 à vie"
    ];
    for (const text of evasions) expect(findForbiddenWordingAnyLanguage(text).length, JSON.stringify(text)).toBeGreaterThan(0);
    expect(findForbiddenWordingAnyLanguage("Con\u200Btrat val\u00ADidé")).toEqual(["contrat valide"]);
    expect(findForbiddenWordingAnyLanguage("Souscrivez-maintenant")).toEqual(["souscrivez maintenant"]);
    expect(findForbiddenWordingAnyLanguage("Garantie\u00A0acceptée")).toEqual(["garantie acceptee"]);
    expect(findForbiddenWordingAnyLanguage("garantie.acceptee")).toEqual(["garantie acceptee"]);
    expect(findForbiddenWordingAnyLanguage("ｂｕｙ ｎｏｗ")).toEqual(["buy now"]);
    // The separators of the normalisation do not create a phrase out of unrelated words.
    expect(findForbiddenWordingAnyLanguage("Le prix. Garanties incluses")).toEqual([]);
  });

  it("matches the English phrases on word boundaries", () => {
    expect(findForbiddenWordingAnyLanguage("This is an invalid contract")).toEqual([]);
    expect(findForbiddenWordingAnyLanguage("Please confirm price")).toEqual([]);
    expect(findForbiddenWordingAnyLanguage("A valid contract")).toEqual(["valid contract"]);
    expect(findForbiddenWordingAnyLanguage("valid contracts are binding")).toEqual(["valid contract"]);
    expect(findForbiddenWordingAnyLanguage("Firm price today")).toEqual(["firm price"]);
    expect(findForbiddenWordingAnyLanguage("valid-contract")).toEqual(["valid contract"]);
  });

  it("blocks the English equivalents", () => {
    expect(findForbiddenWordingAnyLanguage("Your price is guaranteed")).toEqual(["guaranteed"]);
    expect(findForbiddenWordingAnyLanguage("Contract validated today")).toEqual(["contract validated"]);
    expect(findForbiddenWordingAnyLanguage("Subscribe now or buy now")).toEqual(["buy now", "subscribe now"]);
    expect(findForbiddenWordingAnyLanguage("Valid contract, validated contract")).toEqual(["valid contract", "validated contract"]);
    expect(findForbiddenWordingAnyLanguage("Coverage details and guarantees")).toEqual([]);
  });

  it("never lets through what the legacy guards already block", () => {
    const samples = ["Acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptée", "la meilleure assurance du marché", "Buy now", "guaranteed callback", "firm price", "best insurance on the market", "cover accepted"];
    for (const sample of samples) {
      const legacy = findForbiddenWording(sample);
      const next = findForbiddenWordingAnyLanguage(sample);
      expect(next.length, sample).toBeGreaterThan(0);
      for (const wording of legacy) expect(next, sample).toContain(wording);
    }
  });

  it("keeps the legacy guard (used by emails and form labels) unchanged", () => {
    expect(findForbiddenWording("Les garanties incluses, garanti")).toEqual([]);
    expect(findForbiddenWording("contrat validé")).toEqual([]);
  });
});

describe("lead messaging contracts (spec 062)", () => {
  it("validates a message body and the idempotency key", () => {
    expect(leadMessageCreateSchema.parse({ body: "  Bonjour  ", clientRequestId: "req-12345678" })).toEqual({ body: "Bonjour", clientRequestId: "req-12345678" });
    expect(leadMessageCreateSchema.safeParse({ body: "" }).success).toBe(false);
    expect(leadMessageCreateSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(leadMessageCreateSchema.safeParse({ body: "x".repeat(LEAD_MESSAGE_BODY_MAX) }).success).toBe(true);
    expect(leadMessageCreateSchema.safeParse({ body: "x".repeat(LEAD_MESSAGE_BODY_MAX + 1) }).success).toBe(false);
    expect(leadMessageCreateSchema.safeParse({ body: "ok", clientRequestId: "bad id!" }).success).toBe(false);
    expect(leadMessageCreateSchema.safeParse({ body: "ok", website: "" }).success).toBe(true);
    expect(leadMessageCreateSchema.safeParse({ body: "ok", extra: 1 }).success).toBe(false);
    // The broker flavour has no honeypot.
    expect(brokerLeadMessageCreateSchema.safeParse({ body: "ok", website: "x" }).success).toBe(false);
  });

  it("strips control characters (a NUL byte included) from the free texts but keeps tab, line feed and carriage return", () => {
    expect(leadMessageCreateSchema.parse({ body: "Bon\u0000jour\u0007 \u001Fmonsieur\u007F" }).body).toBe("Bonjour monsieur");
    expect(leadMessageCreateSchema.parse({ body: "Ligne 1\r\nLigne\t2\nLigne 3" }).body).toBe("Ligne 1\r\nLigne\t2\nLigne 3");
    // A body made of control characters only is empty once stripped.
    expect(leadMessageCreateSchema.safeParse({ body: "\u0000\u0001" }).success).toBe(false);
    expect(brokerLeadMessageCreateSchema.parse({ body: "A\u0000B" }).body).toBe("AB");
    const request = documentRequestCreateSchema.parse({ label: "Carte\u0000 grise", note: "Recto\u0000 verso\u0008" });
    expect(request).toEqual({ label: "Carte grise", note: "Recto verso" });
    expect(documentRequestCreateSchema.parse({ label: "ok", note: "\u0000\u0001" })).toEqual({ label: "ok" });
    expect(dataRequestCreateSchema.parse({ type: "access", detail: "Mon\u0000 dossier" })).toEqual({ type: "access", detail: "Mon dossier" });
    expect(dataRequestRejectSchema.parse({ note: "Hors\u0000 périmètre" })).toEqual({ note: "Hors périmètre" });
    expect(stripControlCharacters("a\u0000b\tc")).toBe("ab\tc");
  });

  it("accepts a page size up to the whole thread (300) and keeps 50 as the default", () => {
    expect(leadConversationQuerySchema.parse({})).toEqual({ limit: LEAD_MESSAGE_PAGE_SIZE });
    expect(LEAD_MESSAGE_PAGE_SIZE).toBe(50);
    expect(leadConversationQuerySchema.parse({ limit: "300" }).limit).toBe(LEAD_MESSAGE_THREAD_MAX);
    expect(leadConversationQuerySchema.safeParse({ limit: "301" }).success).toBe(false);
    expect(leadConversationQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("declares the masked flag of the admin conversations view and the fields the compliance console reads", () => {
    expect(adminLeadConversationsViewSchema.parse({ quoteRequestId: "q", masked: true, conversations: [] })).toEqual({ quoteRequestId: "q", masked: true, conversations: [] });
    expect(adminLeadConversationsViewSchema.safeParse({ quoteRequestId: "q", conversations: [] }).success).toBe(false);
    const item = { id: "i", reference: "DR-AB12CD34", type: "access", status: "received", createdAt: "2026-10-15T10:00:00.000Z", dueAt: "2026-11-14T10:00:00.000Z" };
    expect(adminDataRequestListItemSchema.parse({ ...item, quoteReference: "QR-1", locale: "en" })).toMatchObject({ quoteReference: "QR-1", locale: "en", overdue: false });
    expect(adminDataRequestListItemSchema.parse(item)).not.toHaveProperty("quoteReference");
    expect(adminDataRequestDetailSchema.parse({ ...item, erasureAllowed: true, history: [] })).toMatchObject({ erasureAllowed: true });
  });

  it("validates a document request", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(documentRequestCreateSchema.parse({ label: " Carte grise ", note: "", dueAt: future })).toEqual({ label: "Carte grise", dueAt: future });
    expect(documentRequestCreateSchema.safeParse({ label: "x".repeat(DOCUMENT_REQUEST_LABEL_MAX + 1) }).success).toBe(false);
    expect(documentRequestCreateSchema.safeParse({ label: "" }).success).toBe(false);
    expect(documentRequestCreateSchema.safeParse({ label: "ok", note: "x".repeat(501) }).success).toBe(false);
  });

  it("renders the non-contractual notice in both languages with the broker name", () => {
    expect(leadMessagingNotice("fr", "Cabinet Kone")).toBe("Échange avec Cabinet Kone. AssurMatch est une plateforme technique : ces messages ne constituent ni un contrat ni une garantie.");
    expect(leadMessagingNotice("en", "Cabinet Kone")).toContain("Cabinet Kone");
    expect(leadMessagingNotice("en", "Cabinet Kone")).not.toContain("{partnerName}");
  });

  it("adds the messaging summary to the tracking view with a safe default", () => {
    const legacy = { publicReference: "QR-1", language: "fr", country: { isoCode: "CI", name: "CI" }, product: { key: "auto", name: "Auto" }, status: "in_progress", brokers: [], timeline: [], consent: { withdrawn: false }, tokenExpiresAt: null };
    expect(publicQuoteStatusViewSchema.parse(legacy).messaging).toEqual({ enabled: false, unreadCount: 0 });
    expect(publicQuoteStatusViewSchema.parse({ ...legacy, messaging: { enabled: true, unreadCount: 2 } }).messaging).toEqual({ enabled: true, unreadCount: 2 });
  });

  it("declares the new error codes and notification types", () => {
    for (const code of ["MESSAGING_DISABLED", "CONVERSATION_READ_ONLY", "DUPLICATE_MESSAGE", "THREAD_LIMIT_REACHED", "DOCUMENT_REQUEST_NOT_OPEN", "DOCUMENT_REQUEST_LIMIT_REACHED", "DATA_REQUEST_ALREADY_OPEN", "DATA_REQUEST_INVALID_TRANSITION"]) {
      expect((ErrorCodes as Record<string, string>)[code]).toBe(code);
    }
    for (const type of ["visitor_broker_message", "visitor_documents_requested", "visitor_data_request_acknowledged", "visitor_data_request_closed", "broker_visitor_message", "admin_data_request_received"]) {
      expect(notificationSchema.safeParse({ type, recipientScope: "x", payloadReference: "y" }).success, type).toBe(true);
    }
  });
});

describe("data request contracts (spec 062, D-10)", () => {
  it("validates the references", () => {
    expect(isDataRequestReference("DR-AB12CD34")).toBe(true);
    expect(isDataRequestReference("DR-ab12cd34")).toBe(false);
    expect(isDataRequestReference("DR-AB12CD3")).toBe(false);
    expect(isDataRequestReference("QR-AB12CD34")).toBe(false);
    expect(isDataRequestReference(undefined)).toBe(false);
  });

  it("validates the visitor request and the admin actions", () => {
    expect(dataRequestCreateSchema.parse({ type: "access", detail: "" })).toEqual({ type: "access" });
    expect(dataRequestCreateSchema.safeParse({ type: "delete" }).success).toBe(false);
    expect(dataRequestCreateSchema.safeParse({ type: "erasure", detail: "x".repeat(DATA_REQUEST_DETAIL_MAX + 1) }).success).toBe(false);
    expect(dataRequestRejectSchema.safeParse({}).success).toBe(false);
    expect(dataRequestRejectSchema.safeParse({ note: "  " }).success).toBe(false);
    expect(dataRequestRejectSchema.parse({ note: "Demande hors périmètre" })).toEqual({ note: "Demande hors périmètre" });
    expect(dataRequestCompleteSchema.parse({})).toEqual({});
  });

  it("allows only received -> in_review -> completed|rejected (or straight from received)", () => {
    expect(canTransitionDataRequest("received", "in_review")).toBe(true);
    expect(canTransitionDataRequest("received", "completed")).toBe(true);
    expect(canTransitionDataRequest("in_review", "rejected")).toBe(true);
    expect(canTransitionDataRequest("completed", "in_review")).toBe(false);
    expect(canTransitionDataRequest("rejected", "completed")).toBe(false);
    expect(canTransitionDataRequest("in_review", "received")).toBe(false);
  });
});
