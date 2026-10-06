import { describe, expect, it } from "vitest";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { PublicFormEmailTemplateService } from "../../../src/modules/notifications/email/public-form-email-template.service";
import { PublicFormNotificationService } from "../../../src/modules/notifications/public-form-notification.service";

const templates = new PublicFormEmailTemplateService({ publicAppUrl: "http://public.test" });
const base = { to: "awa@candidat.example", contactName: "Awa Kone", publicReference: "PA-2026-abcd1234" };

describe("partner application decision e-mail (spec 051 FR-017)", () => {
  it("accepts in French as a technical partnership, not an accreditation", () => {
    const email = templates.partnerApplicationDecision({ ...base, decision: "accepted" });
    expect(email.purpose).toBe("partner_application_decision");
    expect(email.subject).toContain("PA-2026-abcd1234");
    expect(email.body).toContain("partenariat technique");
    expect(email.body).toContain("ne constitue pas un agrement");
    expect(email.body).toContain("http://public.test/confidentialite");
    expect(findForbiddenWording(`${email.subject}\n${email.body}`)).toEqual([]);
  });

  it("refuses neutrally in English, without any reason or note", () => {
    const email = templates.partnerApplicationDecision({ ...base, decision: "rejected", locale: "en" });
    expect(email.body).toContain("cannot take it further");
    expect(email.body).toContain("not an opinion on your accreditation");
    expect(email.body).toContain("http://public.test/en/privacy");
    expect(email.body).not.toMatch(/licence_unverifiable|license_unverifiable|reason:/i);
  });

  it("never throws: a failing transport is reported as failed", async () => {
    const service = new PublicFormNotificationService({ send: async () => { throw new Error("smtp down"); } }, templates);
    await expect(service.notifyPartnerApplicationDecision({ ...base, decision: "accepted" })).resolves.toBe("failed");
    await expect(new PublicFormNotificationService(undefined, templates).notifyPartnerApplicationDecision({ ...base, decision: "rejected" })).resolves.toBe("not_configured");
  });
});
