import { expect } from "@playwright/test";
import { e2eEnv } from "./env";

// Mailpit HTTP API reader (https://mailpit.axllent.org/docs/api-v1/). Every e-mail the API and the
// worker send in the e2e stack lands here; the specs read links and assert recipients/subjects.

export interface MailSummary {
  ID: string;
  Subject: string;
  To: Array<{ Name: string; Address: string }>;
  Created: string;
}

export interface MailMessage extends MailSummary {
  Text: string;
  HTML: string;
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${e2eEnv.mailpitUrl}${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function searchMessages(query: string): Promise<MailSummary[]> {
  const result = await api<{ messages: MailSummary[] }>(`/api/v1/search?query=${encodeURIComponent(query)}&limit=200`);
  return result.messages;
}

export async function readMessage(id: string): Promise<MailMessage> {
  return api<MailMessage>(`/api/v1/message/${encodeURIComponent(id)}`);
}

export interface WaitForMailOptions {
  to: string;
  subject?: RegExp;
  body?: RegExp;
  /** Ignore messages already seen (IDs), e.g. to wait for a SECOND e-mail of the same kind. */
  exclude?: ReadonlySet<string>;
  timeoutMs?: number;
}

/**
 * Polls Mailpit until an e-mail to `to` matches. The worker delivers queued notifications every
 * few seconds, so the default budget covers several worker cycles.
 */
export async function waitForMail(options: WaitForMailOptions): Promise<MailMessage> {
  const { to, subject, body, exclude, timeoutMs = 90_000 } = options;
  let found: MailMessage | undefined;
  await expect
    .poll(
      async () => {
        const messages = await searchMessages(`to:"${to}"`);
        // Newest first in Mailpit; keep that order so a resend wins over the first e-mail.
        for (const summary of messages) {
          if (exclude?.has(summary.ID)) continue;
          if (subject && !subject.test(summary.Subject)) continue;
          const message = await readMessage(summary.ID);
          if (body && !body.test(`${message.Text}\n${message.HTML}`)) continue;
          found = message;
          return true;
        }
        return false;
      },
      { timeout: timeoutMs, intervals: [1_000, 2_000, 3_000], message: `e-mail to ${to} matching ${subject ?? ""} ${body ?? ""}` }
    )
    .toBe(true);
  return found as MailMessage;
}

/** Returns the first link of the message whose URL matches `pattern` (text part first, then HTML). */
export function extractLink(message: MailMessage, pattern: RegExp): string {
  const candidates = `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s"'<>)]+/gu) ?? [];
  const link = candidates.map((url) => url.replace(/&amp;/gu, "&")).find((url) => pattern.test(url));
  if (!link) throw new Error(`no link matching ${pattern} in "${message.Subject}"`);
  return link;
}

export async function messageIdsTo(to: string): Promise<Set<string>> {
  return new Set((await searchMessages(`to:"${to}"`)).map((message) => message.ID));
}
