import type { MessagingProviderPort, MessagingSendRequest, MessagingSendResult } from "../messaging-provider.port";

export type FetchLike = typeof fetch;

export const DEFAULT_CHANNEL_HTTP_TIMEOUT_MS = 10_000;

const RECIPIENT_PATTERN = /^\+?[1-9]\d{6,14}$/;

/** Returns the digits-only recipient with an optional leading "+", or undefined when it is not a valid phone number. */
export function normalizeRecipient(raw: string): string | undefined {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  return RECIPIENT_PATTERN.test(cleaned) ? cleaned : undefined;
}

export function failure(provider: string, errorClass: string, retryable: boolean): MessagingSendResult {
  return { provider, accepted: false, retryable, errorClass, reason: errorClass };
}

async function readProviderMessageId(response: Response, extractId: (body: unknown) => unknown): Promise<string | undefined> {
  try {
    const value = extractId(await response.json());
    return typeof value === "string" && value.length > 0 ? value.slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Shared HTTP call + classification. Never copies the response body, the recipient, the key or the URL
 * into the result. Never logs.
 */
export async function postAndClassify(
  provider: string,
  fetcher: FetchLike,
  timeoutMs: number,
  url: string,
  init: { headers: Record<string, string>; body: string },
  extractId: (body: unknown) => unknown
): Promise<MessagingSendResult> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return failure(provider, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error", true);
  }
  const status = response.status;
  if (status >= 200 && status < 300) {
    const providerMessageId = await readProviderMessageId(response, extractId);
    return { provider, accepted: true, ...(providerMessageId ? { providerMessageId } : {}) };
  }
  if (status >= 300 && status < 400) return failure(provider, "redirect_blocked", false);
  const retryable = status === 429 || status === 408 || status >= 500;
  return failure(provider, `http_${status}`, retryable);
}

export interface HttpSmsProviderOptions {
  /** `json` = generic gateway (Bearer); `twilio` = form-encoded with Basic auth. */
  format: "json" | "twilio";
  apiUrl: string;
  apiKey: string;
  sender?: string | undefined;
  /** Required for the `twilio` format (Basic auth user). */
  accountId?: string | undefined;
  timeoutMs?: number | undefined;
  fetcher?: FetchLike | undefined;
}

export class HttpSmsProvider implements MessagingProviderPort {
  readonly name = "http-sms";
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpSmsProviderOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CHANNEL_HTTP_TIMEOUT_MS;
  }

  async send(request: MessagingSendRequest): Promise<MessagingSendResult> {
    const recipient = normalizeRecipient(request.recipient);
    if (!recipient) return failure(this.name, "invalid_recipient", false);
    const to = recipient.startsWith("+") ? recipient : `+${recipient}`;
    const sender = this.options.sender ?? "";
    let headers: Record<string, string>;
    let body: string;
    if (this.options.format === "twilio") {
      const credentials = Buffer.from(`${this.options.accountId ?? ""}:${this.options.apiKey}`).toString("base64");
      headers = { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
      body = new URLSearchParams({ To: to, From: sender, Body: request.body }).toString();
    } else {
      headers = { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
      body = JSON.stringify({ to, from: sender, body: request.body });
    }
    return postAndClassify(this.name, this.fetcher, this.timeoutMs, this.options.apiUrl, { headers, body }, (parsed) => {
      if (typeof parsed !== "object" || parsed === null) return undefined;
      const record = parsed as Record<string, unknown>;
      return [record.sid, record.id, record.messageId].find((value) => typeof value === "string");
    });
  }
}
