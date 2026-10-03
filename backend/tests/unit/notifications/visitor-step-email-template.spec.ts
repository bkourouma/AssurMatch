import { describe, expect, it } from "vitest";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { QuoteEmailTemplateNotSafeError, QuoteEmailTemplateService, type VisitorEmailStep } from "../../../src/modules/notifications/email/quote-email-template.service";

const templates = new QuoteEmailTemplateService({ publicAppUrl: "http://public.test" });
const STEPS: VisitorEmailStep[] = ["received", "in_review", "transmitted", "accepted", "reassigned", "closed", "not_transmitted", "consent_withdrawn", "tracking_link"];
const expiresAt = new Date("2026-11-02T10:00:00.000Z");

function render(step: VisitorEmailStep, locale: "fr" | "en", partnerName?: string) {
  return templates.visitorStep({
    step,
    to: "awa@visitor.example",
    displayName: "Awa",
    publicReference: "QR-2026-ABCDEF12",
    countryCode: "CI",
    productKey: "auto",
    locale,
    partnerName,
    token: "tok_en-123",
    tokenExpiresAt: expiresAt
  });
}

describe("visitor step e-mails (spec 054 R10)", () => {
  it("renders every step in French and English with a localised link carrying the fresh token", () => {
    for (const step of STEPS) {
      const fr = render(step, "fr", "Courtier X");
      const en = render(step, "en", "Courtier X");
      expect(fr.body, step).toContain("http://public.test/demandes-de-devis/QR-2026-ABCDEF12?token=tok_en-123");
      expect(en.body, step).toContain("http://public.test/en/quote-requests/QR-2026-ABCDEF12?token=tok_en-123");
      expect(fr.html, step).toContain('href="http://public.test/demandes-de-devis/QR-2026-ABCDEF12?token=tok_en-123"');
      expect(fr.body, step).toContain("2026-11-02");
      expect(fr.body, step).toContain("plateforme technique");
      expect(en.body, step).toContain("technical platform");
      expect(fr.subject).not.toBe(en.subject);
      for (const text of [fr.subject, fr.body, fr.html ?? "", en.subject, en.body]) expect(findForbiddenWording(text), step).toEqual([]);
    }
  });

  it("uses one e-mail purpose per step", () => {
    expect(STEPS.map((step) => render(step, "fr").purpose)).toEqual([
      "quote_visitor_received",
      "quote_visitor_in_review",
      "quote_visitor_transmitted",
      "quote_visitor_accepted",
      "quote_visitor_reassigned",
      "quote_visitor_closed",
      "quote_visitor_non_routable",
      "quote_visitor_consent_withdrawn",
      "quote_visitor_tracking_link"
    ]);
  });

  it("names the broker of the step", () => {
    expect(render("transmitted", "fr", "Courtier X").body).toContain("transmise a Courtier X");
    expect(render("accepted", "en", "Courtier X").body).toContain("Courtier X has taken on");
    expect(render("reassigned", "fr", "Courtier Y").body).toContain("reaffectee a Courtier Y");
  });

  it("never announces a request in manual review, not transmitted or received as transmitted (FR-010)", () => {
    for (const step of ["received", "in_review", "not_transmitted"] as const) {
      expect(render(step, "fr").body.toLowerCase(), step).not.toMatch(/a ete transmise|ete transmise a/);
      expect(render(step, "en").body.toLowerCase(), step).not.toMatch(/has been forwarded/);
    }
    expect(render("in_review", "fr").body).toContain("en cours de verification");
    expect(render("in_review", "en").body).toContain("checking it");
  });

  it("carries no form answer and no contact detail other than the recipient", () => {
    const rendered = STEPS.map((step) => {
      const email = render(step, "fr", "Courtier X");
      return `${email.subject}\n${email.body}\n${email.html}`;
    }).join("\n");
    expect(rendered).not.toContain("+225");
    expect(rendered).not.toContain("awa@visitor.example");
    expect(rendered).not.toMatch(/\d+\s*(XOF|EUR|FCFA)/i);
  });

  it("refuses English regulated wording that the French list does not cover", () => {
    expect(() => render("transmitted", "en", "Buy now Insurance Ltd")).toThrow(QuoteEmailTemplateNotSafeError);
    expect(() => render("transmitted", "fr", "Souscrire maintenant SARL")).toThrow(QuoteEmailTemplateNotSafeError);
  });

  it("escapes the broker name in the HTML body", () => {
    const email = render("transmitted", "fr", "<b>X</b>");
    expect(email.html).not.toContain("<b>X</b>");
    expect(email.html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
