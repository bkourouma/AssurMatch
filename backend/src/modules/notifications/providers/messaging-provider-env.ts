import type { MessagingProviderConfig } from "../messaging-provider.service";
import type { MessagingProviderPort } from "../messaging-provider.port";
import { HttpSmsProvider } from "./http-sms-provider";
import { WhatsAppCloudProvider } from "./whatsapp-cloud-provider";

/**
 * Resolves the optional SMS / WhatsApp providers from the environment. Everything is disabled by default:
 * without a recognised provider AND a complete valid configuration, no instance is returned and the dispatcher
 * keeps the local LoggingMessagingProvider.
 *
 * SMS:
 *   ASSURMATCH_SMS_PROVIDER      `http` | `twilio` (any other value = unrecognised, never instantiated)
 *   ASSURMATCH_SMS_API_KEY       secret (Bearer token, or Twilio auth token)
 *   ASSURMATCH_SMS_API_URL       https URL, no credentials, no fragment (Twilio: .../Accounts/<sid>/Messages.json)
 *   ASSURMATCH_SMS_SENDER        sender id / number
 *   ASSURMATCH_SMS_ACCOUNT_ID    required for `twilio` (account SID)
 * WhatsApp:
 *   ASSURMATCH_WHATSAPP_PROVIDER          `whatsapp_cloud`
 *   ASSURMATCH_WHATSAPP_API_KEY           access token
 *   ASSURMATCH_WHATSAPP_PHONE_NUMBER_ID   sender phone number id
 *   ASSURMATCH_WHATSAPP_API_BASE_URL      default https://graph.facebook.com/v21.0 (https only)
 *   ASSURMATCH_WHATSAPP_TEMPLATE_NAME     default assurmatch_operational_alert
 *   ASSURMATCH_WHATSAPP_TEMPLATE_LANGUAGE default fr
 * Common:
 *   ASSURMATCH_CHANNEL_HTTP_TIMEOUT_MS    default 10000, clamped to 1000..30000
 *
 * The returned config never contains a key.
 */
export function resolveMessagingProviders(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): { config: MessagingProviderConfig; smsProvider?: MessagingProviderPort; whatsappProvider?: MessagingProviderPort } {
  const read = (key: string): string | undefined => {
    const value = env[key]?.trim();
    return value ? value : undefined;
  };
  const timeoutRaw = Number(read("ASSURMATCH_CHANNEL_HTTP_TIMEOUT_MS"));
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.min(30_000, Math.max(1_000, Math.trunc(timeoutRaw))) : 10_000;

  const smsName = read("ASSURMATCH_SMS_PROVIDER");
  const smsKey = read("ASSURMATCH_SMS_API_KEY");
  const whatsappName = read("ASSURMATCH_WHATSAPP_PROVIDER");
  const whatsappKey = read("ASSURMATCH_WHATSAPP_API_KEY");

  const result: { config: MessagingProviderConfig; smsProvider?: MessagingProviderPort; whatsappProvider?: MessagingProviderPort } = {
    config: {
      smsProvider: env.ASSURMATCH_SMS_PROVIDER,
      smsSecretConfigured: Boolean(smsKey),
      whatsappProvider: env.ASSURMATCH_WHATSAPP_PROVIDER,
      whatsappSecretConfigured: Boolean(whatsappKey)
    }
  };

  if (smsName === "http" || smsName === "twilio") {
    const apiUrl = httpsUrl(read("ASSURMATCH_SMS_API_URL"));
    const sender = read("ASSURMATCH_SMS_SENDER");
    const accountId = read("ASSURMATCH_SMS_ACCOUNT_ID");
    const valid = Boolean(smsKey && apiUrl && sender && (smsName === "http" || accountId));
    result.config.smsSecretConfigured = valid;
    if (valid) {
      result.smsProvider = new HttpSmsProvider({
        format: smsName === "twilio" ? "twilio" : "json",
        apiUrl: apiUrl as string,
        apiKey: smsKey as string,
        sender,
        accountId,
        timeoutMs,
        fetcher
      });
    }
  }

  if (whatsappName === "whatsapp_cloud") {
    const baseUrl = httpsUrl(read("ASSURMATCH_WHATSAPP_API_BASE_URL") ?? "https://graph.facebook.com/v21.0");
    const phoneNumberId = read("ASSURMATCH_WHATSAPP_PHONE_NUMBER_ID");
    const valid = Boolean(whatsappKey && baseUrl && phoneNumberId && /^[A-Za-z0-9_-]+$/.test(phoneNumberId));
    result.config.whatsappSecretConfigured = valid;
    if (valid) {
      result.whatsappProvider = new WhatsAppCloudProvider({
        baseUrl: baseUrl as string,
        phoneNumberId: phoneNumberId as string,
        accessToken: whatsappKey as string,
        templateName: read("ASSURMATCH_WHATSAPP_TEMPLATE_NAME") ?? "assurmatch_operational_alert",
        languageCode: read("ASSURMATCH_WHATSAPP_TEMPLATE_LANGUAGE") ?? "fr",
        timeoutMs,
        fetcher
      });
    }
  }

  return result;
}

/** Accepts only https URLs without embedded credentials or fragment. */
function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
