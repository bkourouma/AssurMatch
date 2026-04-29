import { createHash } from "node:crypto";

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.toLowerCase().split("@");
  if (!localPart || !domain) return "[masked-email]";
  return `${hashValue(localPart).slice(0, 12)}@${domain}`;
}

export function hashIp(ip: string): string {
  return hashValue(ip);
}

export function browserFamily(userAgent: string): string {
  const value = userAgent.toLowerCase();
  if (value.includes("firefox")) return "firefox";
  if (value.includes("edg/")) return "edge";
  if (value.includes("chrome")) return "chrome";
  if (value.includes("safari")) return "safari";
  return "unknown";
}
