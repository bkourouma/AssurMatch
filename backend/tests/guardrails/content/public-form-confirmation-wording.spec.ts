import { describe, expect, it } from "vitest";
import { PublicFormEmailTemplateService } from "../../../src/modules/notifications/email/public-form-email-template.service";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";

const templates = new PublicFormEmailTemplateService({ publicAppUrl: "http://public.test" });

/**
 * Spec 047. The check runs on the *rendered* messages rather than on the template source, so a
 * regulated phrase cannot slip in through a locale branch nobody re-read.
 *
 * The shared `FORBIDDEN_REGULATED_WORDING` list is French-only, so the English equivalents are
 * spelled out here: a bilingual confirmation must not promise in English what it may not promise
 * in French (constitution I and II).
 */
const FORBIDDEN_ENGLISH = [
  "buy now",
  "subscribe now",
  "valid contract",
  "coverage accepted",
  "cover accepted",
  "guaranteed callback",
  "best insurance on the market",
  "we recommend"
];

function renderedMessages(): string {
  const payloads = [
    templates.waitlist({ to: "a@example.test", countryCode: "CI" }),
    templates.waitlist({ to: "a@example.test", countryCode: "CI", locale: "en" }),
    templates.contact({ to: "a@example.test", name: "Awa", publicReference: "CM-2026-ABCDEF12" }),
    templates.contact({ to: "a@example.test", name: "Awa", publicReference: "CM-2026-ABCDEF12", locale: "en" }),
    templates.partnerApplication({ to: "a@example.test", contactName: "Awa", publicReference: "PA-2026-abcdef12" }),
    templates.partnerApplication({
      to: "a@example.test",
      contactName: "Awa",
      publicReference: "PA-2026-abcdef12",
      locale: "en"
    })
  ];
  return payloads.map((payload) => [payload.subject, payload.body, payload.html ?? ""].join("\n")).join("\n");
}

describe("public form confirmation wording (spec 047)", () => {
  it("carries no regulated wording in either locale", () => {
    const rendered = renderedMessages();

    expect(findForbiddenWording(rendered)).toEqual([]);
    const lowered = rendered.toLocaleLowerCase("en-US");
    FORBIDDEN_ENGLISH.forEach((forbidden) => {
      expect(lowered, forbidden).not.toContain(forbidden);
    });
  });

  it("states the platform's technical role and promises no outcome", () => {
    const fr = templates.waitlist({ to: "a@example.test", countryCode: "CI" });
    const en = templates.waitlist({ to: "a@example.test", countryCode: "CI", locale: "en" });

    expect(fr.body).toContain("plateforme technique");
    expect(en.body).toContain("technical platform");
    // A waiting-list entry is not a quote request and compares nothing (constitution I).
    expect(fr.body).toContain("aucune offre n'a ete comparee");
    expect(en.body).toContain("no offer has been compared");
  });

  it("never claims an application is accepted or a contact message answered", () => {
    const application = templates.partnerApplication({
      to: "a@example.test",
      contactName: "Awa",
      publicReference: "PA-2026-abcdef12"
    });
    const contact = templates.contact({ to: "a@example.test", name: "Awa", publicReference: "CM-2026-ABCDEF12" });

    expect(application.body).toContain("ni acceptation ni refus");
    expect(application.body).toContain("Aucun compte partenaire n'existe a ce stade.");
    expect(contact.body).toContain("ne constitue pas une reponse");
  });
});
