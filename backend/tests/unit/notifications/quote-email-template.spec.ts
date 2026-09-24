import { describe, expect, it } from "vitest";
import { QuoteEmailTemplateNotSafeError, QuoteEmailTemplateService } from "../../../src/modules/notifications/email/quote-email-template.service";

const templates = new QuoteEmailTemplateService({ publicAppUrl: "http://public.test", brokerAppUrl: "http://broker.test" });

describe("QuoteEmailTemplateService (spec 044)", () => {
  it("tells the visitor their request was transmitted, with their own reference and no broker identity", () => {
    const email = templates.visitor({
      to: "visiteur@example.test",
      displayName: "Awa",
      publicReference: "QR-2026-ABCDEF12",
      countryCode: "CI",
      productKey: "auto",
      routed: true
    });

    expect(email.purpose).toBe("quote_visitor_confirmation");
    expect(email.subject).toContain("QR-2026-ABCDEF12");
    expect(email.body).toContain("Bonjour Awa,");
    expect(email.body).toContain("transmise a un courtier partenaire eligible");
    expect(email.body).toContain("http://public.test/quote-requests/QR-2026-ABCDEF12");
    expect(email.body).toContain("plateforme technique de comparaison indicative");
    // The platform does not disclose which broker was selected before first contact.
    expect(email.body.toLowerCase()).not.toContain("courtier local");
    expect(email.body).not.toMatch(/\d+\s*(XOF|EUR|FCFA)/i);
  });

  it("uses the non-routable wording when no broker was available", () => {
    const email = templates.visitor({
      to: "visiteur@example.test",
      publicReference: "QR-2026-11111111",
      countryCode: "CI",
      productKey: "auto",
      routed: false
    });

    expect(email.purpose).toBe("quote_visitor_non_routable");
    expect(email.body).toContain("Aucun courtier partenaire eligible n'est disponible");
    expect(email.body).toContain("Bonjour,");
  });

  it("gives the broker a pointer and never the lead itself", () => {
    const email = templates.brokerLead({
      to: "courtier@example.test",
      partnerLegalName: "Courtier Local Pro SARL",
      publicReference: "QR-2026-ABCDEF12",
      countryCode: "CI",
      productKey: "auto"
    });

    expect(email.purpose).toBe("quote_broker_lead");
    expect(email.body).toContain("QR-2026-ABCDEF12");
    expect(email.body).toContain("http://broker.test/leads");
    expect(email.body).toContain("ne sont pas reprises dans cet email");
    // D1: email leaves every access control the platform applies to this data.
    const rendered = `${email.subject} ${email.body} ${email.html ?? ""}`;
    for (const leaked of ["visiteur@example.test", "+2250102030405", "professionnel", "175000"]) {
      expect(rendered).not.toContain(leaked);
    }
  });

  it("refuses to render a message carrying regulated wording", () => {
    expect(() => templates.brokerLead({
      to: "courtier@example.test",
      partnerLegalName: "Souscrire maintenant SARL",
      publicReference: "QR-2026-ABCDEF12",
      countryCode: "CI",
      productKey: "auto"
    })).toThrow(QuoteEmailTemplateNotSafeError);
  });

  it("escapes recipient-controlled text in the HTML body", () => {
    const email = templates.brokerLead({
      to: "courtier@example.test",
      partnerLegalName: "<script>alert(1)</script>",
      publicReference: "QR-2026-ABCDEF12",
      countryCode: "CI",
      productKey: "auto"
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
