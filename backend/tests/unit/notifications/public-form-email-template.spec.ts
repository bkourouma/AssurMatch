import { describe, expect, it } from "vitest";
import {
  PublicFormEmailTemplateNotSafeError,
  PublicFormEmailTemplateService
} from "../../../src/modules/notifications/email/public-form-email-template.service";

const templates = new PublicFormEmailTemplateService({ publicAppUrl: "http://public.test" });

describe("PublicFormEmailTemplateService (spec 047)", () => {
  it("confirms a waiting-list registration in French by default, with no engagement", () => {
    const email = templates.waitlist({ to: "visiteur@example.test", countryCode: "sn" });

    expect(email.purpose).toBe("public_waitlist_confirmation");
    expect(email.subject).toContain("liste d'attente");
    expect(email.body).toContain("Bonjour,");
    // The country code is normalised: the form sends whatever the URL segment carried.
    expect(email.body).toContain("pour SN");
    expect(email.body).toContain("n'engage ni vous ni nous");
    expect(email.body).toContain("http://public.test/confidentialite");
    expect(email.body).toContain("plateforme technique de comparaison indicative");
  });

  it("confirms a waiting-list registration in English under the /en privacy path", () => {
    const email = templates.waitlist({ to: "visitor@example.test", countryCode: "SN", locale: "en" });

    expect(email.subject).toContain("waiting-list");
    expect(email.body).toContain("Hello,");
    expect(email.body).toContain("commits neither you nor us");
    expect(email.body).toContain("http://public.test/en/privacy");
    expect(email.body).toContain("authorised partner brokers");
  });

  it("acknowledges a contact message with its reference and never with the submitted body", () => {
    const email = templates.contact({
      to: "visiteur@example.test",
      name: "Awa",
      publicReference: "CM-2026-ABCDEF12"
    });

    expect(email.purpose).toBe("public_contact_confirmation");
    expect(email.subject).toContain("CM-2026-ABCDEF12");
    expect(email.body).toContain("Bonjour Awa,");
    expect(email.body).toContain("Votre reference: CM-2026-ABCDEF12");
    expect(email.body).toContain("ne constitue pas une reponse");
  });

  it("acknowledges a broker application without accepting it and announces the licence request", () => {
    const email = templates.partnerApplication({
      to: "courtier@example.test",
      contactName: "Moussa Traore",
      publicReference: "PA-2026-1234abcd",
      locale: "en"
    });

    expect(email.purpose).toBe("public_partner_application_confirmation");
    expect(email.subject).toContain("PA-2026-1234abcd");
    expect(email.body).toContain("Hello Moussa Traore,");
    expect(email.body).toContain("No partner account exists at this stage.");
    expect(email.body).toContain("request a copy of your licence");
    expect(email.body).toContain("neither an acceptance nor a refusal");
  });

  it("falls back to French when the locale is absent or unsupported", () => {
    const absent = templates.contact({ to: "a@example.test", name: "Awa", publicReference: "CM-2026-1" });
    // A value outside the contract can only reach the service through an unvalidated caller; it must
    // still render rather than throw, because the submission is already stored at this point.
    const unsupported = templates.contact({
      to: "a@example.test",
      name: "Awa",
      publicReference: "CM-2026-1",
      locale: "es" as never
    });

    expect(absent.body).toContain("Bonjour Awa,");
    expect(unsupported.body).toBe(absent.body);
  });

  it("refuses to render a message carrying regulated wording", () => {
    expect(() =>
      templates.partnerApplication({
        to: "courtier@example.test",
        contactName: "Souscrire maintenant SARL",
        publicReference: "PA-2026-1234abcd"
      })
    ).toThrow(PublicFormEmailTemplateNotSafeError);
  });

  it("escapes submitter-controlled text in the HTML body and drops blank separators", () => {
    const email = templates.contact({
      to: "visiteur@example.test",
      name: "<script>alert(1)</script>",
      publicReference: "CM-2026-ABCDEF12"
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<p></p>");
  });
});
