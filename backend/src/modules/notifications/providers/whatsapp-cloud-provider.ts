import type { MessagingProviderPort, MessagingSendRequest, MessagingSendResult } from "../messaging-provider.port";
import { DEFAULT_CHANNEL_HTTP_TIMEOUT_MS, failure, normalizeRecipient, postAndClassify, type FetchLike } from "./http-sms-provider";

export interface WhatsAppCloudProviderOptions {
  /** Graph API base, e.g. https://graph.facebook.com/v21.0 */
  baseUrl: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  languageCode: string;
  timeoutMs?: number | undefined;
  fetcher?: FetchLike | undefined;
}

export class WhatsAppCloudProvider implements MessagingProviderPort {
  readonly name = "whatsapp-cloud";
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: WhatsAppCloudProviderOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CHANNEL_HTTP_TIMEOUT_MS;
  }

  async send(request: MessagingSendRequest): Promise<MessagingSendResult> {
    const recipient = normalizeRecipient(request.recipient);
    if (!recipient) return failure(this.name, "invalid_recipient", false);
    const url = `${this.options.baseUrl.replace(/\/+$/, "")}/${this.options.phoneNumberId}/messages`;
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient.replace(/^\+/, ""),
      type: "template",
      template: {
        name: this.options.templateName,
        language: { code: this.options.languageCode },
        components: [{ type: "body", parameters: [{ type: "text", text: request.body.slice(0, 1024) }] }]
      }
    });
    const headers = { Authorization: `Bearer ${this.options.accessToken}`, "Content-Type": "application/json", Accept: "application/json" };
    return postAndClassify(this.name, this.fetcher, this.timeoutMs, url, { headers, body }, (parsed) => {
      if (typeof parsed !== "object" || parsed === null) return undefined;
      const messages = (parsed as { messages?: unknown }).messages;
      const first: unknown = Array.isArray(messages) ? messages[0] : undefined;
      return typeof first === "object" && first !== null ? (first as { id?: unknown }).id : undefined;
    });
  }
}
