import { maskText } from "../common/logging/pii-masker";

/**
 * Spec 058 FR-001: one JSON object per line on stdout, masked before it is serialised.
 *
 * Every value goes through `maskLogValue`: a sensitive key (password, secret, token, authorization,
 * cookie, API key, MFA or backup code...) is replaced whatever its value, and every string is
 * cleaned by `maskText` (e-mail, E.164 phone, UUID, bearer credential, JWT, `token=` query param).
 * Logging is silent under NODE_ENV=test unless a test installs a sink.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogEntry = { at: string; level: LogLevel; event: string } & Record<string, unknown>;
export type LogSink = (entry: LogEntry) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY_PATTERN = /pass(word)?|secret|token|authori[sz]ation|cookie|api[-_]?key|otp|backup[-_]?codes?|mfa[-_]?code|totp|dsn|private[-_]?key|credential|^email$|^phone$|^ip$|^to$/i;
const MAX_DEPTH = 6;
const MAX_STRING = 4000;

let sink: LogSink | undefined;

/** Installs a sink (tests); `undefined` restores stdout. */
export function setLogSink(next: LogSink | undefined): void {
  sink = next;
}

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function maskLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const masked = maskText(value);
    return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}...` : masked;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => maskLogValue(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveLogKey(key) && nested !== undefined && nested !== null ? "[masked]" : maskLogValue(nested, depth + 1);
  }
  return output;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;
  if (!sink && process.env.NODE_ENV === "test") return;
  const entry = { at: new Date().toISOString(), level, event, ...(maskLogValue(fields) as Record<string, unknown>) } as LogEntry;
  try {
    if (sink) sink(entry);
    else process.stdout.write(`${JSON.stringify(entry)}\n`);
  } catch {
    // A logging failure never breaks a request.
  }
}

/** Stack frames only, masked, without the first line (the message is logged separately). */
export function maskedStack(error: unknown, maxFrames = 20): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  const frames = error.stack.split(/\r?\n/).filter((line) => /^\s+at\s/.test(line)).slice(0, maxFrames);
  return maskText(frames.map((line) => line.trim()).join("\n"));
}
