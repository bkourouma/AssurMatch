import { describe, expect, it } from "vitest";
import { findForbiddenWording, findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import {
  DOCUMENT_REQUEST_LABEL_MAX,
  LEAD_MESSAGE_BODY_MAX,
  brokerLeadMessageCreateSchema,
  documentRequestCreateSchema,
  leadMessageCreateSchema,
  leadMessagingNotice
} from "../../../../packages/shared/contracts/lead-messaging";
import {
  DATA_REQUEST_DETAIL_MAX,
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

  it("blocks the stand-alone words garanti / garantis but never the nouns garantie / garanties", () => {
    expect(findForbiddenWordingAnyLanguage("Remboursement garanti")).toEqual(["garanti"]);
    expect(findForbiddenWordingAnyLanguage("Tarifs GARANTIS à vie")).toEqual(["garantis"]);
    expect(findForbiddenWordingAnyLanguage("Un prix garanti.")).toEqual(["garanti"]);
    expect(findForbiddenWordingAnyLanguage("Les garanties incluses")).toEqual([]);
    expect(findForbiddenWordingAnyLanguage("Voici le détail des garanties et de la garantie décès")).toEqual([]);
    expect(findForbiddenWordingAnyLanguage("Niveau de garantie : standard")).toEqual([]);
    expect(findForbiddenWordingAnyLanguage("garantissent")).toEqual([]);
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
