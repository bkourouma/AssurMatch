import { describe, expect, it } from "vitest";
import { AuditLogsModule } from "../../../src/modules/audit-logs/audit-logs.module";
import {
  RuntimeEmailDeliveryService,
  type AuthEmailDeliveryPort,
  type AuthEmailDeliveryResult,
  type AuthEmailPayload
} from "../../../src/modules/notifications/email/email-delivery.service";
import { PublicFormNotificationService } from "../../../src/modules/notifications/public-form-notification.service";

function recordingSender(): { sender: AuthEmailDeliveryPort; sent: AuthEmailPayload[] } {
  const sent: AuthEmailPayload[] = [];
  return {
    sent,
    sender: {
      async send(payload: AuthEmailPayload): Promise<AuthEmailDeliveryResult> {
        sent.push(payload);
        return { status: "sent", provider: "smtp" };
      }
    }
  };
}

describe("PublicFormNotificationService (spec 047)", () => {
  it("reports not_configured and sends nothing when no sender is wired", async () => {
    const service = new PublicFormNotificationService();

    await expect(service.confirmWaitlist({ to: "a@example.test", countryCode: "CI" })).resolves.toBe("not_configured");
    await expect(service.confirmContact({ to: "a@example.test", name: "Awa", publicReference: "CM-1" })).resolves.toBe(
      "not_configured"
    );
    await expect(
      service.confirmPartnerApplication({ to: "a@example.test", contactName: "Awa", publicReference: "PA-1" })
    ).resolves.toBe("not_configured");
  });

  it("sends the three confirmations with their own purpose and the requested locale", async () => {
    const { sender, sent } = recordingSender();
    const service = new PublicFormNotificationService(sender);

    await service.confirmWaitlist({ to: "a@example.test", countryCode: "CI", locale: "en" });
    await service.confirmContact({ to: "b@example.test", name: "Awa", publicReference: "CM-1", locale: "fr" });
    await service.confirmPartnerApplication({ to: "c@example.test", contactName: "Moussa", publicReference: "PA-1" });

    expect(sent.map((payload) => payload.purpose)).toEqual([
      "public_waitlist_confirmation",
      "public_contact_confirmation",
      "public_partner_application_confirmation"
    ]);
    expect(sent[0]?.body).toContain("Hello,");
    expect(sent[1]?.body).toContain("Bonjour Awa,");
  });

  /**
   * The submission is already stored and audited when this runs, so nothing here may throw: a broken
   * transport must degrade to a failed confirmation, never to a failed submission.
   */
  it("reports failed instead of throwing when the transport throws", async () => {
    const service = new PublicFormNotificationService({
      async send(): Promise<AuthEmailDeliveryResult> {
        throw new Error("smtp unreachable");
      }
    });

    await expect(service.confirmContact({ to: "a@example.test", name: "Awa", publicReference: "CM-1" })).resolves.toBe(
      "failed"
    );
  });

  it("reports failed instead of throwing when the wording guardrail refuses the rendering", async () => {
    const { sender, sent } = recordingSender();
    const service = new PublicFormNotificationService(sender);

    await expect(
      service.confirmContact({ to: "a@example.test", name: "Souscrire maintenant", publicReference: "CM-1" })
    ).resolves.toBe("failed");
    expect(sent).toHaveLength(0);
  });

  it("audits every delivery under email.delivery.* with a masked recipient", async () => {
    const audit = new AuditLogsModule();
    const delivery = new RuntimeEmailDeliveryService(
      { serviceType: "smtp", smtpSecure: false, sendTimeoutMs: 1000, previewMode: true },
      audit.writer
    );
    const service = new PublicFormNotificationService(delivery);

    await expect(service.confirmWaitlist({ to: "Jane.Doe@example.test", countryCode: "CI" })).resolves.toBe("previewed");

    const rows = audit.writer.search({ action: "email.delivery.previewed" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetId).toBe("public_waitlist_confirmation");
    expect(rows[0]?.context).toMatchObject({ recipientMasked: "J***@example.test" });
    expect(JSON.stringify(rows[0]?.context)).not.toContain("jane.doe");
  });
});
