import type { AuthEmailDeliveryPort, AuthEmailPayload } from "./email/email-delivery.service";
import {
  PublicFormEmailTemplateService,
  type ContactConfirmationContext,
  type PartnerApplicationConfirmationContext,
  type WaitlistConfirmationContext
} from "./email/public-form-email-template.service";

export type PublicFormEmailStatus = "not_configured" | "previewed" | "sent" | "failed";

/**
 * What the three public-site intake services depend on, so a test can assert "a confirmation was
 * attempted for this address, in this locale" without an SMTP transport.
 */
export interface PublicFormNotificationPort {
  confirmWaitlist(context: WaitlistConfirmationContext): Promise<PublicFormEmailStatus>;
  confirmContact(context: ContactConfirmationContext): Promise<PublicFormEmailStatus>;
  confirmPartnerApplication(context: PartnerApplicationConfirmationContext): Promise<PublicFormEmailStatus>;
}

/**
 * Spec 047: outbound confirmation for the waitlist, contact and broker-application forms.
 *
 * Delivery is best effort by design. The submission is already recorded and audited by the time
 * this runs, and the visitor's response says the same thing whatever happens here, so a broken
 * SMTP host must never turn an accepted submission into an error. `RuntimeEmailDeliveryService`
 * audits every outcome under `email.delivery.*`, which is where a failed confirmation is read.
 */
export class PublicFormNotificationService implements PublicFormNotificationPort {
  private readonly templates: PublicFormEmailTemplateService;

  constructor(
    private readonly sender?: AuthEmailDeliveryPort,
    templates: PublicFormEmailTemplateService = new PublicFormEmailTemplateService()
  ) {
    this.templates = templates;
  }

  async confirmWaitlist(context: WaitlistConfirmationContext): Promise<PublicFormEmailStatus> {
    return this.deliver(() => this.templates.waitlist(context));
  }

  async confirmContact(context: ContactConfirmationContext): Promise<PublicFormEmailStatus> {
    return this.deliver(() => this.templates.contact(context));
  }

  async confirmPartnerApplication(context: PartnerApplicationConfirmationContext): Promise<PublicFormEmailStatus> {
    return this.deliver(() => this.templates.partnerApplication(context));
  }

  /**
   * The template is built inside the try: the wording guardrail throws, and a refused rendering is
   * a failed confirmation, not a failed submission.
   */
  private async deliver(build: () => AuthEmailPayload): Promise<PublicFormEmailStatus> {
    if (!this.sender) return "not_configured";
    try {
      const result = await this.sender.send(build());
      if (!result) return "sent";
      return result.status;
    } catch {
      return "failed";
    }
  }
}
