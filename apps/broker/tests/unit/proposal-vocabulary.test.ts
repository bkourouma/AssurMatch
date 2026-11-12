import { describe, expect, it } from "vitest";
import { PROPOSAL_NOTICES, buildProposalPayload, proposalOutcome } from "../../app/lib/proposal-vocabulary";
import { CONVERSATION_NOTICES, conversationOutcome } from "../../app/lib/conversation-vocabulary";

function form(validUntil: string): FormData {
  const data = new FormData();
  data.set("message", "Bonjour, voici une proposition.");
  data.set("priceMin", "1000");
  data.set("priceMax", "2000");
  data.set("currency", "XOF");
  data.set("validUntil", validUntil);
  return data;
}

const NOW = new Date("2026-11-12T10:00:00.000Z");

describe("proposalOutcome", () => {
  it("shows a dedicated notice for a 413", () => {
    const key = proposalOutcome({ status: 413 }, "sent");
    expect(PROPOSAL_NOTICES[key]?.message).toBe("Fichier refusé : taille maximale 5 Mo.");
  });

  it("keeps the generic refusal for 400 and 422", () => {
    expect(proposalOutcome({ status: 400 }, "sent")).toBe("invalid");
    expect(proposalOutcome({ status: 422 }, "sent")).toBe("invalid");
  });
});

describe("buildProposalPayload validity date", () => {
  it("refuses today and the past with the validity reason", () => {
    expect(buildProposalPayload(form("2026-11-12"), NOW)).toEqual({ ok: false, reason: "validity" });
    expect(buildProposalPayload(form("2026-11-01"), NOW)).toEqual({ ok: false, reason: "validity" });
    expect(PROPOSAL_NOTICES.validity_past?.message).toBe("La date de validité doit être postérieure à aujourd'hui.");
  });

  it("accepts tomorrow (the min of the date field)", () => {
    expect(buildProposalPayload(form("2026-11-13"), NOW).ok).toBe(true);
  });

  it("reports a generic failure when something else is wrong too", () => {
    const data = form("2026-11-01");
    data.set("message", "");
    expect(buildProposalPayload(data, NOW)).toEqual({ ok: false });
  });
});

describe("conversation duplicate", () => {
  it("maps the duplicate code and a bare 409 to the readable notice", () => {
    expect(conversationOutcome({ status: 409, code: "DUPLICATE_MESSAGE" }, "sent")).toBe("duplicate");
    expect(conversationOutcome({ status: 409 }, "sent")).toBe("duplicate");
    expect(CONVERSATION_NOTICES.duplicate?.message).toBe("Ce message vient déjà d'être envoyé. Attendez la réponse du visiteur avant de le renvoyer.");
  });
});
