import { describe, expect, it, vi } from "vitest";
import { HttpSmsProvider } from "../../../src/modules/notifications/providers/http-sms-provider";
import { WhatsAppCloudProvider } from "../../../src/modules/notifications/providers/whatsapp-cloud-provider";
import { resolveMessagingProviders } from "../../../src/modules/notifications/providers/messaging-provider-env";

const KEY = "super-secret-key-123";
const PHONE = "+225 01 02 03 04 05";
const request = { channel: "sms" as const, recipient: PHONE, template: "t", body: "Hello world" };

function mockFetch(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}
function calls(fetcher: unknown): Array<[string, RequestInit]> {
  return (fetcher as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls;
}
const sms = (fetcher: typeof fetch, format: "json" | "twilio" = "json") =>
  new HttpSmsProvider({ format, apiUrl: "https://sms.example.com/send", apiKey: KEY, sender: "ASSUR", accountId: "AC123", fetcher });
const wa = (fetcher: typeof fetch) =>
  new WhatsAppCloudProvider({ baseUrl: "https://graph.example.com/v21.0", phoneNumberId: "555", accessToken: KEY, templateName: "tpl", languageCode: "fr", fetcher });

describe("HttpSmsProvider", () => {
  it("sends JSON with Bearer auth", async () => {
    const f = mockFetch(200, { id: "m-1" });
    const result = await sms(f).send(request);
    expect(result).toEqual({ provider: "http-sms", accepted: true, providerMessageId: "m-1" });
    const [url, init] = calls(f)[0]!;
    expect(url).toBe("https://sms.example.com/send");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({ to: "+2250102030405", from: "ASSUR", body: "Hello world" });
  });

  it("sends twilio form with Basic auth", async () => {
    const f = mockFetch(201, { sid: "SM1" });
    const result = await sms(f, "twilio").send(request);
    expect(result.providerMessageId).toBe("SM1");
    const [, init] = calls(f)[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`AC123:${KEY}`).toString("base64")}`);
    const form = new URLSearchParams(init.body as string);
    expect(form.get("To")).toBe("+2250102030405");
    expect(form.get("From")).toBe("ASSUR");
    expect(form.get("Body")).toBe("Hello world");
  });

  it.each([[500, true], [429, true], [408, true], [400, false], [401, false]])("classifies HTTP %i (retryable=%s)", async (status, retryable) => {
    const result = await sms(mockFetch(status, { error: "leak-body-xyz" })).send(request);
    expect(result).toMatchObject({ accepted: false, retryable, errorClass: `http_${status}`, reason: `http_${status}` });
  });

  it("blocks redirects", async () => {
    expect(await sms(mockFetch(302)).send(request)).toMatchObject({ accepted: false, retryable: false, errorClass: "redirect_blocked" });
  });

  it("classifies timeout and network errors as retryable", async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException("t", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await sms(timeout).send(request)).toMatchObject({ retryable: true, errorClass: "timeout" });
    const net = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await sms(net).send(request)).toMatchObject({ retryable: true, errorClass: "network_error" });
  });

  it("rejects an invalid recipient without a network call", async () => {
    const f = mockFetch(200);
    const result = await sms(f).send({ ...request, recipient: "abc" });
    expect(result).toMatchObject({ accepted: false, retryable: false, errorClass: "invalid_recipient", reason: "invalid_recipient" });
    expect(calls(f)).toHaveLength(0);
  });

  it("never leaks number, key or response body in the result", async () => {
    const result = await sms(mockFetch(500, { error: "leak-body-xyz" })).send(request);
    const text = JSON.stringify(result);
    for (const secret of [KEY, "0102030405", "leak-body-xyz", "sms.example.com"]) expect(text).not.toContain(secret);
  });
});

describe("WhatsAppCloudProvider", () => {
  it("posts a template message", async () => {
    const f = mockFetch(200, { messages: [{ id: "wamid.1" }] });
    const result = await wa(f).send({ ...request, channel: "whatsapp", body: "x".repeat(2000) });
    expect(result).toEqual({ provider: "whatsapp-cloud", accepted: true, providerMessageId: "wamid.1" });
    const [url, init] = calls(f)[0]!;
    expect(url).toBe("https://graph.example.com/v21.0/555/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "2250102030405", type: "template", template: { name: "tpl", language: { code: "fr" } } });
    expect(body.template.components[0].parameters[0].text).toHaveLength(1024);
  });

  it("classifies failures and invalid recipients", async () => {
    expect(await wa(mockFetch(503)).send(request)).toMatchObject({ retryable: true, errorClass: "http_503" });
    expect(await wa(mockFetch(401)).send(request)).toMatchObject({ retryable: false, errorClass: "http_401" });
    const f = mockFetch(200);
    expect(await wa(f).send({ ...request, recipient: "12" })).toMatchObject({ errorClass: "invalid_recipient" });
    expect(calls(f)).toHaveLength(0);
  });
});

describe("resolveMessagingProviders", () => {
  const full = {
    ASSURMATCH_SMS_PROVIDER: "http",
    ASSURMATCH_SMS_API_KEY: KEY,
    ASSURMATCH_SMS_API_URL: "https://sms.example.com/send",
    ASSURMATCH_SMS_SENDER: "ASSUR",
    ASSURMATCH_WHATSAPP_PROVIDER: "whatsapp_cloud",
    ASSURMATCH_WHATSAPP_API_KEY: KEY,
    ASSURMATCH_WHATSAPP_PHONE_NUMBER_ID: "555"
  } as NodeJS.ProcessEnv;

  it("creates nothing when nothing is configured", () => {
    const r = resolveMessagingProviders({}, mockFetch(200));
    expect(r.smsProvider).toBeUndefined();
    expect(r.whatsappProvider).toBeUndefined();
    expect(r.config).toMatchObject({ smsSecretConfigured: false, whatsappSecretConfigured: false });
  });

  it("creates instances for complete http + whatsapp_cloud configuration", () => {
    const r = resolveMessagingProviders(full, mockFetch(200));
    expect(r.smsProvider?.name).toBe("http-sms");
    expect(r.whatsappProvider?.name).toBe("whatsapp-cloud");
    expect(r.config).toMatchObject({ smsSecretConfigured: true, whatsappSecretConfigured: true });
    expect(JSON.stringify(r.config)).not.toContain(KEY);
  });

  it("handles twilio and requires the account id", () => {
    const twilio = { ...full, ASSURMATCH_SMS_PROVIDER: "twilio" };
    expect(resolveMessagingProviders(twilio, mockFetch(200)).smsProvider).toBeUndefined();
    const ok = resolveMessagingProviders({ ...twilio, ASSURMATCH_SMS_ACCOUNT_ID: "AC1" }, mockFetch(200));
    expect(ok.smsProvider?.name).toBe("http-sms");
    expect(ok.config.smsSecretConfigured).toBe(true);
  });

  it("refuses non-https or credentialed URLs", () => {
    const r = resolveMessagingProviders({ ...full, ASSURMATCH_SMS_API_URL: "http://sms.example.com", ASSURMATCH_WHATSAPP_API_BASE_URL: "http://graph.example.com" }, mockFetch(200));
    expect(r.smsProvider).toBeUndefined();
    expect(r.whatsappProvider).toBeUndefined();
    expect(r.config).toMatchObject({ smsSecretConfigured: false, whatsappSecretConfigured: false });
    expect(resolveMessagingProviders({ ...full, ASSURMATCH_SMS_API_URL: "https://u:p@sms.example.com" }, mockFetch(200)).smsProvider).toBeUndefined();
  });

  it("keeps legacy behaviour for an unrecognised provider", () => {
    const r = resolveMessagingProviders({ ASSURMATCH_WHATSAPP_PROVIDER: "meta-cloud", ASSURMATCH_WHATSAPP_API_KEY: KEY }, mockFetch(200));
    expect(r.whatsappProvider).toBeUndefined();
    expect(r.config).toMatchObject({ whatsappProvider: "meta-cloud", whatsappSecretConfigured: true });
    expect(JSON.stringify(r.config)).not.toContain(KEY);
  });
});
