import type { OptionalChannel } from "../../../../packages/shared/contracts/messaging-provider.contracts";

export interface MessagingSendRequest {
  channel: OptionalChannel;
  recipient: string;
  template: string;
  body: string;
}

export interface MessagingSendResult {
  provider: string;
  accepted: boolean;
  reason?: string | undefined;
}

export interface MessagingProviderPort {
  readonly name: string;
  send(request: MessagingSendRequest): Promise<MessagingSendResult>;
}

/**
 * Default provider: accepts the message locally without any network call, so a deployment that
 * turns `sms_enabled` or `whatsapp_enabled` on without configuring a real provider still cannot
 * leak a recipient to a third party. The message body itself is never logged.
 */
export class LoggingMessagingProvider implements MessagingProviderPort {
  readonly name = "logging";
  private readonly sent: Array<{ channel: OptionalChannel; template: string }> = [];

  async send(request: MessagingSendRequest): Promise<MessagingSendResult> {
    this.sent.push({ channel: request.channel, template: request.template });
    return { provider: this.name, accepted: true };
  }

  history(): Array<{ channel: OptionalChannel; template: string }> {
    return [...this.sent];
  }
}
