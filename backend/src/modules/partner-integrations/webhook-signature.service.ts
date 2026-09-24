import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function signWebhookPayload(secret: string, timestamp: string, eventId: string, idempotencyKey: string, payload: unknown): string {
  const body = canonicalPayload(payload);
  const digest = createHmac("sha256", secret).update(`${timestamp}.${eventId}.${idempotencyKey}.${body}`).digest("hex");
  return `v1=${digest}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  eventId: string;
  idempotencyKey: string;
  payload: unknown;
  signature: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) return false;
  const expected = signWebhookPayload(input.secret, input.timestamp, input.eventId, input.idempotencyKey, input.payload);
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signature);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function canonicalPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}
